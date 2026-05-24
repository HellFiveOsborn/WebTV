# WebTV - Diretrizes de Desenvolvimento

## Comandos de Desenvolvimento

### npm run dev
**SEMPRE execute em background (nunca síncrono).**

Para iniciar:
```powershell
Start-Process -FilePath "cmd.exe" -ArgumentList "/c cd /d `"E:\Dev Workspace\WebTV\frontend`" && npm run dev > C:\Users\canal\AppData\Local\Temp\opencode\vite-dev.log 2>&1" -WindowStyle Hidden
```

Para aguardar o servidor ficar pronto:
```powershell
Start-Sleep -Seconds 3
```

Para interromper:
```powershell
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force
```

### npm run build
Comando síncrono seguro:
```bash
npm run build
```
Output esperado em `dist/`

### npm install
Comando síncrono seguro:
```bash
npm install
```
