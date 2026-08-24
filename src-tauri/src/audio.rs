use rustfft::{Fft, FftPlanner, num_complex::Complex};
use serde::Serialize;
use std::sync::Arc;

const BAND_COUNT: usize = 12;
const FFT_SIZE: usize = 2048;
const SAMPLE_RATE: f32 = 48_000.0;
const BAND_EDGES: [f32; BAND_COUNT + 1] = [
    40.0, 80.0, 160.0, 315.0, 630.0, 1_250.0, 2_500.0, 4_000.0, 6_300.0, 9_000.0, 12_500.0,
    16_000.0, 20_000.0,
];
const BAND_WEIGHTS: [f32; BAND_COUNT] = [
    0.72, 0.78, 0.86, 0.95, 1.04, 1.12, 1.2, 1.3, 1.4, 1.5, 1.62, 1.75,
];

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpectrumPayload {
    bands: [f32; BAND_COUNT],
    active: bool,
}

struct SpectrumAnalyzer {
    fft: Arc<dyn Fft<f32>>,
    buffer: Vec<Complex<f32>>,
    smoothed: [f32; BAND_COUNT],
    band_peaks: [f32; BAND_COUNT],
    gain_peak: f32,
}

impl SpectrumAnalyzer {
    fn new() -> Self {
        let mut planner = FftPlanner::new();
        Self {
            fft: planner.plan_fft_forward(FFT_SIZE),
            buffer: vec![Complex::default(); FFT_SIZE],
            smoothed: [0.0; BAND_COUNT],
            band_peaks: [0.004; BAND_COUNT],
            gain_peak: 0.01,
        }
    }

    fn analyze(&mut self, samples: &[f32]) -> SpectrumPayload {
        for (index, value) in self.buffer.iter_mut().enumerate() {
            let phase = index as f32 / (FFT_SIZE - 1) as f32;
            let window = 0.5 - 0.5 * (std::f32::consts::TAU * phase).cos();
            *value = Complex::new(
                samples.get(index).copied().unwrap_or_default() * window,
                0.0,
            );
        }
        self.fft.process(&mut self.buffer);

        let mut raw = [0.0; BAND_COUNT];
        for (band, value) in raw.iter_mut().enumerate() {
            let start = frequency_bin(BAND_EDGES[band]).max(1);
            let end = frequency_bin(BAND_EDGES[band + 1]).min(FFT_SIZE / 2);
            let energy = self.buffer[start..end]
                .iter()
                .map(Complex::norm_sqr)
                .sum::<f32>()
                / (end - start).max(1) as f32;
            *value = (energy.sqrt() / FFT_SIZE as f32 * 4.0).ln_1p() * BAND_WEIGHTS[band];
        }

        let frame_peak = raw.iter().copied().fold(0.0, f32::max);
        self.gain_peak = frame_peak.max(self.gain_peak * 0.96).max(0.004);
        let noise_gate = frame_peak * 0.008;
        for (band, ((smoothed, peak), value)) in self
            .smoothed
            .iter_mut()
            .zip(self.band_peaks.iter_mut())
            .zip(raw)
            .enumerate()
        {
            *peak = value.max(*peak * 0.985).max(0.0015);
            let local = (value / *peak).clamp(0.0, 1.0);
            let global = (value / self.gain_peak).clamp(0.0, 1.0);
            let presence = if value > noise_gate {
                local * 0.72 + global * 0.28
            } else {
                0.0
            };
            let normalized = (presence * (0.96 + band as f32 * 0.006)).clamp(0.0, 1.0);
            let speed = if normalized > *smoothed { 0.62 } else { 0.28 };
            *smoothed += (normalized - *smoothed) * speed;
        }

        SpectrumPayload {
            bands: self.smoothed,
            active: frame_peak > 0.000_15,
        }
    }
}

fn frequency_bin(frequency: f32) -> usize {
    (frequency * FFT_SIZE as f32 / SAMPLE_RATE).floor() as usize
}

#[cfg(windows)]
pub fn start(app: tauri::AppHandle) {
    std::thread::Builder::new()
        .name("audio-spectrum".to_owned())
        .spawn(move || {
            loop {
                if let Err(error) = capture_loop(&app) {
                    eprintln!("WASAPI loopback capture unavailable: {error}");
                    if tauri::Emitter::emit(
                        &app,
                        "audio-spectrum",
                        SpectrumPayload {
                            bands: [0.0; BAND_COUNT],
                            active: false,
                        },
                    )
                    .is_err()
                    {
                        break;
                    }
                    std::thread::sleep(std::time::Duration::from_secs(3));
                } else {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
            }
        })
        .expect("failed to start audio spectrum thread");
}

#[cfg(windows)]
fn capture_loop(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    use std::collections::VecDeque;
    use wasapi::{DeviceEnumerator, Direction, SampleType, StreamMode, WaveFormat, initialize_mta};

    initialize_mta().ok()?;
    let enumerator = DeviceEnumerator::new()?;
    let device = enumerator.get_default_device(&Direction::Render)?;
    let mut audio_client = device.get_iaudioclient()?;
    let format = WaveFormat::new(32, 32, &SampleType::Float, SAMPLE_RATE as usize, 2, None);
    let (_, minimum_period) = audio_client.get_device_period()?;
    let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: minimum_period,
    };
    audio_client.initialize_client(&format, &Direction::Capture, &mode)?;
    let event = audio_client.set_get_eventhandle()?;
    let capture_client = audio_client.get_audiocaptureclient()?;
    let mut bytes = VecDeque::with_capacity(FFT_SIZE * 16);
    let mut analyzer = SpectrumAnalyzer::new();
    let mut last_active = std::time::Instant::now();
    audio_client.start_stream()?;

    loop {
        capture_client.read_from_device_to_deque(&mut bytes)?;
        while bytes.len() >= FFT_SIZE * 8 {
            let mut mono = vec![0.0; FFT_SIZE];
            for sample in &mut mono {
                let left = pop_f32(&mut bytes);
                let right = pop_f32(&mut bytes);
                *sample = (left + right) * 0.5;
            }
            let spectrum = analyzer.analyze(&mono);
            if spectrum.active {
                last_active = std::time::Instant::now();
            }
            if tauri::Emitter::emit(app, "audio-spectrum", spectrum).is_err() {
                audio_client.stop_stream()?;
                return Ok(());
            }
        }
        if event.wait_for_event(250).is_err()
            && tauri::Emitter::emit(
                app,
                "audio-spectrum",
                SpectrumPayload {
                    bands: [0.0; BAND_COUNT],
                    active: false,
                },
            )
            .is_err()
        {
            audio_client.stop_stream()?;
            return Ok(());
        }
        if last_active.elapsed() > std::time::Duration::from_secs(30) {
            audio_client.stop_stream()?;
            return Ok(());
        }
    }
}

#[cfg(windows)]
fn pop_f32(bytes: &mut std::collections::VecDeque<u8>) -> f32 {
    let data = [
        bytes.pop_front().unwrap_or_default(),
        bytes.pop_front().unwrap_or_default(),
        bytes.pop_front().unwrap_or_default(),
        bytes.pop_front().unwrap_or_default(),
    ];
    f32::from_le_bytes(data)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn analyzer_should_peak_in_band_containing_sine_frequency() {
        let samples = (0..FFT_SIZE)
            .map(|index| (std::f32::consts::TAU * 440.0 * index as f32 / SAMPLE_RATE).sin())
            .collect::<Vec<_>>();
        let mut analyzer = SpectrumAnalyzer::new();

        let spectrum = analyzer.analyze(&samples);
        let peak = spectrum
            .bands
            .iter()
            .enumerate()
            .max_by(|(_, left), (_, right)| left.total_cmp(right))
            .map(|(index, _)| index);

        assert_eq!(peak, Some(3));
    }
}
