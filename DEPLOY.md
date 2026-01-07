# 🚀 Deploy do Scraper na Railway

## ⚙️ Configurações Aplicadas

O servidor foi configurado para rodar em produção (Railway) com as seguintes otimizações:

### Puppeteer para Produção
- ✅ `headless: 'new'` - Modo headless otimizado
- ✅ `--no-sandbox` - Desabilita sandbox (necessário em containers)
- ✅ `--disable-setuid-sandbox` - Desabilita setuid sandbox
- ✅ `--disable-dev-shm-usage` - Usa /tmp em vez de /dev/shm
- ✅ `--disable-accelerated-2d-canvas` - Desabilita aceleração 2D
- ✅ `--disable-gpu` - Desabilita GPU
- ✅ `--window-size=1920x1080` - Define tamanho da janela
- ✅ Viewport configurado
- ✅ Timeout aumentado para 60s
- ✅ Wait de 3s após carregamento da página

### Porta
- A porta é detectada automaticamente via `process.env.PORT`
- Fallback para porta 8080 se não estiver definida

## 📦 Deploy na Railway

### 1. Fazer push do código atualizado
```bash
cd C:\Users\lucas\OneDrive\Desktop\Icell\phone-scraper-server
git add .
git commit -m "Configurar Puppeteer para produção Railway"
git push origin main
```

### 2. Railway detectará automaticamente e fará rebuild

### 3. Verificar logs na Railway
Após o deploy, verifique se os logs mostram:
```
🚀 Phone Scraper Server rodando na porta 8080
📡 Endpoint: http://localhost:8080/api/search-phone
✅ CORS habilitado para o frontend
```

### 4. Testar endpoints
```bash
# Health check
curl https://scraper-icell-production.up.railway.app/health

# Autocomplete (teste)
curl "https://scraper-icell-production.up.railway.app/api/autocomplete?name=iphone"

# Scrape Kimovil (teste)
curl "https://scraper-icell-production.up.railway.app/api/scrape-kimovil?url=apple-iphone-15-pro-max"
```

## 🐛 Debug

Se ainda retornar dados vazios:

### Opção 1: Verificar logs na Railway
- Acesse o dashboard da Railway
- Vá em "Deployments" → Último deploy
- Clique em "View Logs"
- Procure por erros do Puppeteer

### Opção 2: Adicionar variável de ambiente
Na Railway, adicione:
```
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

### Opção 3: Instalar dependências do Chrome
Se necessário, crie um arquivo `nixpacks.toml`:
```toml
[phases.setup]
aptPkgs = [
  "chromium",
  "chromium-sandbox",
  "ca-certificates",
  "fonts-liberation",
  "libappindicator3-1",
  "libasound2",
  "libatk-bridge2.0-0",
  "libatk1.0-0",
  "libc6",
  "libcairo2",
  "libcups2",
  "libdbus-1-3",
  "libexpat1",
  "libfontconfig1",
  "libgbm1",
  "libgcc1",
  "libglib2.0-0",
  "libgtk-3-0",
  "libnspr4",
  "libnss3",
  "libpango-1.0-0",
  "libpangocairo-1.0-0",
  "libstdc++6",
  "libx11-6",
  "libx11-xcb1",
  "libxcb1",
  "libxcomposite1",
  "libxcursor1",
  "libxdamage1",
  "libxext6",
  "libxfixes3",
  "libxi6",
  "libxrandr2",
  "libxrender1",
  "libxss1",
  "libxtst6",
  "lsb-release",
  "wget",
  "xdg-utils"
]
```

## ✅ Frontend Configurado

O admin já está configurado para usar o scraper:

**Development:**
```env
REACT_APP_SCRAPER_URL=http://localhost:3002/api/search-phone
```

**Production (Vercel):**
```env
REACT_APP_SCRAPER_URL=https://scraper-icell-production.up.railway.app/api/search-phone
```

## 📝 Endpoints Disponíveis

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/health` | GET | Health check |
| `/api/search-phone` | POST | Busca especificações (Oficinadanet) |
| `/api/autocomplete` | GET | Autocomplete de dispositivos (Kimovil) |
| `/api/scrape-kimovil` | GET | Extrai dados da Kimovil com Puppeteer |
| `/api/scrape-olx` | GET | Busca preços na OLX |
| `/api/scrape-amazon` | GET | Busca preços na Amazon |
| `/api/scrape-mercado-livre` | GET | Busca preços no Mercado Livre |
