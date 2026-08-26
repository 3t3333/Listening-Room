use librespot::discovery::Discovery;
use librespot::core::config::DeviceType;

async fn test() {
    let mut d = Discovery::builder("a".to_string(), "b".to_string()).name("a").device_type(DeviceType::Computer).launch().unwrap();
    let creds = d.next().await;
}

fn main() {}
