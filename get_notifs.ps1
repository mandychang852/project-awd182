
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType=WindowsRuntime] | Out-Null
$histories = [Windows.UI.Notifications.ToastNotificationManager]::History.GetHistory()
$result = @()
foreach ($h in $histories) {
    $obj = [PSCustomObject]@{
        AppId = $h.AppId
        Content = $h.Content.GetXml()
        ExpirationTime = $h.ExpirationTime
    }
    $result += $obj
}
$result | ConvertTo-Json -Depth 5
