fn main() {
    tauri_build::build();
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        cc::Build::new().cpp(true)
            .file("src/desktop_icon_probe.cpp")
            .flag_if_supported("/std:c++17")
            .compile("desktop_icon_probe");
        for lib in ["ole32", "oleaut32", "shell32", "shlwapi", "uuid", "user32", "gdi32"] {
            println!("cargo:rustc-link-lib={lib}");
        }
    }
}
