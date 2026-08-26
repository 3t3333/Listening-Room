use librespot::connect::{ConnectConfig, Spirc};
use librespot::core::authentication::Credentials;
use librespot::core::cache::Cache;
use librespot::core::config::{DeviceType, SessionConfig};
use librespot::core::session::Session;
use librespot::playback::{
    audio_backend,
    config::{AudioFormat, Bitrate, PlayerConfig},
    mixer::{self, MixerConfig},
    player::Player,
};
use std::path::PathBuf;
use std::time::Duration;

pub async fn start_headless_player(app_data_dir: PathBuf) {
    let session_config = SessionConfig {
        device_id: "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d".to_owned(),
        ..Default::default()
    };

    let player_config = PlayerConfig {
        bitrate: Bitrate::Bitrate160,
        ..Default::default()
    };
    let audio_format = AudioFormat::default();
    let mixer_config = MixerConfig::default();
    let connect_config = ConnectConfig {
        name: "Listening Room Player".to_owned(),
        device_type: DeviceType::Computer,
        initial_volume: 42597,
        ..Default::default()
    };

    let cache = Cache::new(
        Some(app_data_dir.clone()),
        Some(app_data_dir.clone()),
        Some(app_data_dir.clone()),
        None,
    )
    .unwrap();

    loop {
        println!("Checking for cached Librespot credentials...");
        let credentials = match cache.credentials() {
            Some(creds) => {
                println!("Found cached Librespot credentials.");
                creds
            }
            None => {
                println!(
                    "No cached credentials found. Launching Spotify OAuth login in your browser..."
                );
                let token_res = librespot_oauth::OAuthClientBuilder::new(
                    &session_config.client_id,
                    "http://127.0.0.1:8898/login",
                    vec!["streaming"],
                )
                .open_in_browser()
                .build()
                .expect("Failed to build OAuth client")
                .get_access_token();

                match token_res {
                    Ok(t) => {
                        println!("Credentials received from browser!");
                        Credentials::with_access_token(t.access_token)
                    }
                    Err(e) => {
                        eprintln!("OAuth login failed: {e}. Retrying in 5 seconds...");
                        tokio::time::sleep(Duration::from_secs(5)).await;
                        continue;
                    }
                }
            }
        };

        println!("Initializing session and player...");
        let session = Session::new(session_config.clone(), Some(cache.clone()));

        let mixer_builder = mixer::find(None).expect("Failed to find mixer");
        let mixer = mixer_builder(mixer_config.clone()).expect("Failed to build mixer");

        let sink_builder = audio_backend::find(None).expect("Failed to find audio backend");

        let player = Player::new(
            player_config.clone(),
            session.clone(),
            mixer.get_soft_volume(),
            move || sink_builder(None, audio_format),
        );

        match Spirc::new(connect_config.clone(), session, credentials, player, mixer).await {
            Ok((_spirc, spirc_task)) => {
                println!("Spirc successfully initialized. Ready to play!");
                spirc_task.await;
                println!("Spirc task ended. Reconnecting...");
            }
            Err(e) => {
                eprintln!("Failed to create spirc: {e}. Retrying in 5 seconds...");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    }
}
