use std::ffi::OsStr;
use std::process::Command as StdCommand;
use tokio::process::Command as TokioCommand;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Windows creation flag to prevent spawning a visible CMD/console window
#[cfg(target_os = "windows")]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Constructs a synchronous `std::process::Command` with console window suppression on Windows
pub fn new_command<S: AsRef<OsStr>>(program: S) -> StdCommand {
    let mut cmd = StdCommand::new(program);
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

/// Constructs an asynchronous `tokio::process::Command` with console window suppression on Windows
pub fn new_async_command<S: AsRef<OsStr>>(program: S) -> TokioCommand {
    let std_cmd = new_command(program);
    TokioCommand::from(std_cmd)
}
