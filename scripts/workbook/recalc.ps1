# Forces Microsoft Excel (via COM, invisible) to recalculate every *.nocache.xlsx in a folder and saves the result
# as *.recalc.xlsx. The no-cache copies carry formulas only, so every value Excel writes is its own result.
param([Parameter(Mandatory = $true)][string]$Dir)

$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
# The Excel that recalculated: verify.ts archive puts it into verification/excel-run.json.
"Microsoft Excel $($excel.Version) (build $($excel.Build))" | Set-Content -Path (Join-Path $Dir "excel-version.txt") -Encoding utf8
try {
    Get-ChildItem -Path $Dir -Filter "*.nocache.xlsx" | ForEach-Object {
        $target = Join-Path $_.DirectoryName ($_.Name -replace "\.nocache\.xlsx$", ".recalc.xlsx")
        if (Test-Path $target) { Remove-Item $target -Force }
        $wb = $excel.Workbooks.Open($_.FullName, 0, $true)
        $excel.CalculateFull()
        $wb.SaveAs($target, 51)
        $wb.Close($false)
        "recalculated: $($_.Name)"
    }
}
finally {
    $excel.Quit()
    [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
