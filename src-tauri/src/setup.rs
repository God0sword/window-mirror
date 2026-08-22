//! Setup — Application Initialization
//!
//! Runs once at Tauri startup. Verifies data directories, seeds default
//! settings, and forwards proxy events to the frontend event bus.

use anyhow::Result;
use tauri::{App, Emitter, Manager};
use tokio::sync::broadcast;
use tracing::instrument;

use crate::state::AppState;

#[instrument(skip(app))]
pub fn setup_app(app: &mut App) -> std::result::Result<(), Box<dyn std::error::Error>> {
    tracing::info!("Setting up Window Mirror application");

    let handle = app.handle().clone();

    // AppState is managed by the window-mirror plugin's setup hook
    // (see main.rs). Here we only do post-state bootstrapping.
    let state = app.state::<AppState>();

    // Forward MITM proxy events → Tauri frontend + timeline store.
    let mut rx: broadcast::Receiver<crate::mitm_proxy::ProxyEvent> =
        state.proxy.subscribe();
    let h = handle.clone();
    let timeline = state.timeline.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(ev) => {
                    // Frontend gets the raw event for live panels.
                    let _ = h.emit("window-mirror://proxy-event", &ev);
                    // Timeline keeps a durable copy of network traffic.
                    if let Some(req) = &ev.request {
                        let _ = timeline.append(crate::timeline::MirrorEvent::Network(
                            crate::timeline::NetworkEvent {
                                id: req.id.clone(),
                                timestamp: chrono::DateTime::from_timestamp_millis(req.timestamp)
                                    .unwrap_or_default(),
                                method: req.method.clone(),
                                url: req.url.clone(),
                                status: ev.response.as_ref().map(|r| r.status_code).unwrap_or(0),
                                request_headers: req.headers.iter().map(|(k, v)| (k.clone(), v.clone())).collect(),
                                response_headers: ev.response.as_ref()
                                    .map(|r| r.headers.iter().map(|(k, v)| (k.clone(), v.clone())).collect())
                                    .unwrap_or_default(),
                                request_body: req.body.clone(),
                                response_body: ev.response.as_ref().and_then(|r| r.body.clone()),
                                duration_ms: ev.response.as_ref()
                                    .and_then(|r| r.timing.total).unwrap_or(0),
                                source_location: None,
                            },
                        )).await;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!("proxy event listener lagged, dropped {n}");
                }
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });

    tracing::info!("Application setup complete");
    Ok(())
}
