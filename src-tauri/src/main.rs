//! Window Mirror — Tauri Entry Point
//!
//! A unified browser-IDE-pentest platform.
//! The surveillance platform that happens to render HTML.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod events;
mod state;
mod setup;
mod sandbox;
mod timeline;
mod workspace;
mod ca_manager;
mod rules_engine;
mod chromium_launcher;
mod mitm_proxy;

use std::sync::Arc;

use tauri::{
    Manager, Runtime,
    plugin::{Builder as PluginBuilder, TauriPlugin},
};

use crate::{
    commands::*,
    events::*,
    state::AppState,
    setup::setup_app,
};

/// Application entry point
fn main() {
    // Initialize tracing early
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "window_mirror=debug,tauri=info".into()),
        )
        .with_target(false)
        .with_thread_ids(true)
        .with_file(true)
        .with_line_number(true)
        .init();

    tracing::info!("Starting Window Mirror v{}", env!("CARGO_PKG_VERSION"));

    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(window_mirror_plugin())
        .setup(|app| setup_app(app))
        .invoke_handler(tauri::generate_handler![
            // Window/Mode commands
            get_current_mode,
            set_mode,
            toggle_sidebar,
            get_sidebar_state,
            // Editor commands
            open_file,
            save_file,
            close_file,
            get_open_files,
            // Workspace commands
            get_workspace_state,
            create_workspace,
            switch_workspace,
            // Proxy/Mirror commands
            start_proxy,
            stop_proxy,
            get_proxy_status,
            get_proxy_config,
            set_proxy_config,
            generate_ca,
            get_ca_pem,
            install_ca,
            launch_chromium,
            kill_chromium,
            get_proxy_rules,
            add_proxy_rule,
            update_proxy_rule,
            delete_proxy_rule,
            toggle_proxy_rule,
            reorder_proxy_rules,
            resume_proxy_request,
            replay_proxy_request,
            export_proxy_har,
            export_proxy_curl,
            clear_proxy_history,
            get_proxy_stats,
            get_recent_events,
            // Settings
            get_settings,
            update_settings,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to run Window Mirror");
}

/// Window Mirror core plugin — registers background services, state, channels
fn window_mirror_plugin() -> TauriPlugin<tauri::Wry> {
    PluginBuilder::new("window-mirror")
        .invoke_handler(tauri::generate_handler![
            // Internal/plugin commands
            internal_start_services,
            internal_shutdown_services,
        ])
        .setup(|app, _api| {
            use tauri::Manager;
            // Initialize global app state
            let handle = app.app_handle().clone();
            let app_state = AppState::new(handle.clone());
            app.manage(app_state);

            // Start background services
            tauri::async_runtime::spawn(async move {
                if let Err(e) = internal_start_services(handle).await {
                    tracing::error!("Failed to start background services: {}", e);
                }
            });

            Ok(())
        })
        .build()
}