' XYZW Web Helper - one-click start (no console window)
'
' 双击本文件即可：后台启动本地服务，并自动打开浏览器。
' 关闭：双击 stop.bat。
' 开机自启：把本文件的快捷方式放到 shell:startup 目录。
Dim fso, shell, http, base
Set fso = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = fso.GetParentFolderName(WScript.ScriptFullName)
base = "http://127.0.0.1:8080/"

' 服务已经在跑（比如上次没关），直接开浏览器，别重复启动
If IsUp(base) Then
  shell.Run base, 1, False
  WScript.Quit 0
End If

If Not fso.FileExists("web\index.html") Then
  MsgBox "缺少 web\index.html，压缩包可能没有解压完整。", 16, "XYZW Web Helper"
  WScript.Quit 1
End If
If Not fso.FileExists("node\node.exe") Then
  MsgBox "缺少 node\node.exe，压缩包可能没有解压完整。", 16, "XYZW Web Helper"
  WScript.Quit 1
End If

' 隐藏窗口启动；--open 会在服务就绪后自动打开默认浏览器
shell.Run "cmd /c node\node.exe server.js --port 8080 --open > server.log 2>&1", 0, False

' 给服务 3 秒时间；起不来就把日志位置告诉用户
If Not WaitUp(base, 15) Then
  MsgBox "服务启动失败，请查看本目录下的 server.log。", 48, "XYZW Web Helper"
End If

Function IsUp(url)
  Dim req
  On Error Resume Next
  Set req = CreateObject("MSXML2.XMLHTTP")
  req.Open "GET", url, False
  req.Send
  IsUp = (Err.Number = 0 And req.Status = 200)
  If Err.Number <> 0 Then IsUp = False
  On Error GoTo 0
End Function

Function WaitUp(url, seconds)
  Dim i
  WaitUp = False
  For i = 1 To seconds * 2
    If IsUp(url) Then
      WaitUp = True
      Exit Function
    End If
    WScript.Sleep 500
  Next
End Function
