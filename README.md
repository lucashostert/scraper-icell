# 📱 Phone Scraper Server

Servidor Node.js para fazer scraping de especificações de telefones do **oficinadanet.com.br** e fornecer os dados para o painel admin do ICellFipe.

---

## 🚀 Como Usar

### 1. Instalar Dependências

```bash
cd phone-scraper-server
npm install
```

### 2. Iniciar o Servidor

```bash
npm start
```

O servidor iniciará na porta **3002** e ficará disponível em: `http://localhost:3002`

### 3. Usar no Admin

1. Abra o painel admin do ICellFipe
2. Vá em **Dispositivos > Adicionar Novo**
3. Digite o nome do telefone no campo de busca (ex: "Xiaomi POCO C85")
4. Clique em **Buscar**
5. ✨ O sistema automaticamente:
   - Preenche o modelo do telefone
   - Cria todas as variações (combinações de RAM e Armazenamento)
   - Preenche processador, ano, conexão em cada variação

---

## 📡 API Endpoints

### POST `/api/search-phone`

Busca especificações de um telefone.

**Body:**
```json
{
  "searchTerm": "Xiaomi POCO C85"
}
```

**Resposta de Sucesso:**
```json
{
  "success": true,
  "message": "Dados do telefone encontrados com sucesso!",
  "data": {
    "deviceTitle": "Xiaomi Poco C85",
    "deviceProcessor": "Mediatek Dimensity 6300 (6 nm)",
    "deviceYear": "2025",
    "deviceBroadband": "5G",
    "variations": [
      {
        "id": 1,
        "deviceVersion": "4GB/128GB",
        "deviceProcessor": "Mediatek Dimensity 6300 (6 nm)",
        "deviceMemory": "4",
        "deviceStorage": "128",
        "deviceBroadband": "5G",
        "deviceYear": "2025",
        "devicePrice": {
          "new": { "minValue": 0, "medValue": 0, "maxValue": 0 },
          "used": { "minValue": 0, "medValue": 0, "maxValue": 0 }
        }
      }
    ]
  }
}
```

**Resposta de Erro:**
```json
{
  "success": false,
  "message": "Telefone não encontrado. Verifique o nome e tente novamente."
}
```

---

## 🔧 Como Funciona

1. **Frontend** envia o nome do telefone para o servidor
2. **Servidor** formata o slug (ex: "xiaomi-poco-c85")
3. Faz requisição para `https://www.oficinadanet.com.br/smartphones/{slug}`
4. **Extrai** dados da página HTML usando Cheerio
5. **Processa** especificações e cria variações automaticamente
6. **Retorna** JSON formatado para o frontend

---

## 📋 Dados Extraídos

### Informações Básicas
- ✅ Modelo do telefone
- ✅ Processador
- ✅ Ano de lançamento
- ✅ Tipo de conexão (3G/4G/5G)

### Variações Automáticas
- ✅ Memória RAM (todas as opções)
- ✅ Armazenamento (todas as opções)
- ✅ Versão (combinação RAM/Storage)

**Exemplo:**
- Se o telefone tem **4GB, 6GB e 8GB de RAM** e **128GB e 256GB de armazenamento**
- O sistema cria automaticamente **6 variações**:
  - 4GB/128GB
  - 4GB/256GB
  - 6GB/128GB
  - 6GB/256GB
  - 8GB/128GB
  - 8GB/256GB

---

## ⚙️ Tecnologias

- **Express** - Framework web
- **Axios** - Cliente HTTP
- **Cheerio** - Parser HTML (jQuery para Node.js)
- **CORS** - Habilitado para frontend

---

## 🐛 Troubleshooting

### Erro: "Servidor não está rodando"
```bash
# Verifique se o servidor está rodando
npm start
```

### Erro: "Telefone não encontrado"
- Verifique a ortografia do nome
- Tente variações: "Xiaomi POCO C85", "POCO C85", "Poco C85"
- Confira se o telefone existe em: https://www.oficinadanet.com.br/

### Porta 3002 em uso
Edite `server.js` e mude a porta:
```javascript
const PORT = 3003; // ou outra porta disponível
```

Depois atualize em `adm-icell-fipe/src/controllers/PhoneScrapperController.js`:
```javascript
const SCRAPER_API_URL = 'http://localhost:3003/api/search-phone';
```

---

## 💡 Dicas

1. **Nomes Completos:** Use nome completo com marca (ex: "Samsung Galaxy S21")
2. **Variações:** O sistema detecta automaticamente todas as variações
3. **Preços:** Os preços precisam ser preenchidos manualmente após importar
4. **Cache:** Considere implementar cache Redis para buscas frequentes

---

## 📝 Exemplo de Uso Completo

```bash
# 1. Instalar e iniciar servidor
cd phone-scraper-server
npm install
npm start

# 2. Em outro terminal, testar a API
curl -X POST http://localhost:3002/api/search-phone \
  -H "Content-Type: application/json" \
  -d '{"searchTerm": "Xiaomi POCO C85"}'

# 3. Usar no admin
# Abrir admin → Dispositivos → Buscar telefone → Preenche automaticamente!
```

---

## 🎯 Próximas Melhorias

- [ ] Cache de buscas com Redis
- [ ] Busca por múltiplos sites (GSMArena, etc)
- [ ] Importar imagens automaticamente
- [ ] Sugerir preços baseado em histórico
- [ ] Busca inteligente com sugestões

---

**Pronto para usar! 🚀**
