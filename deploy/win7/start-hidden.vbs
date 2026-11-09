' XYZW Web Helper - start the server without a console window
' Put a shortcut of this file into shell:startup to start it on boot.
Dim fso, shell
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
shell.Run "cmd /c node\node.exe server.js --port 8080 > server.log 2>&1", 0, False
