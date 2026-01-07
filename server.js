const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const app = express();
const PORT = process.env.PORT || 8080;

// Habilita CORS para o frontend admin
app.use(cors());
app.use(express.json());

// Função para extrair especificações do texto de descrição
function scrapePhone(html, phoneSlug) {
  const $ = cheerio.load(html);
  const specs = {};
  
  console.log('🔍 Procurando especificações no Oficinadanet...');
  
  // Oficinadanet coloca as specs na meta description e na div de descrição
  let descriptionText = '';
  
  // Tenta pegar da meta description
  const metaDesc = $('meta[name="description"]').attr('content');
  if (metaDesc) {
    descriptionText = metaDesc;
    console.log('📄 Extraindo de meta description');
  }
  
  // Se não achou, tenta pegar do div de descrição
  if (!descriptionText) {
    descriptionText = $('#obj-det-descr').text() || $('.description').text() || '';
    console.log('📄 Extraindo de div descrição');
  }
  
  // Para detecção de 5G/4G/3G, busca no HTML completo também
  const fullHtmlText = html;
  
  console.log(`📝 Texto da descrição: ${descriptionText.substring(0, 200)}...`);
  
  if (descriptionText) {
    // Extrai processador
    const processorMatch = descriptionText.match(/processador é (?:um |o )?([^.]+)/i);
    if (processorMatch) {
      specs['Processador'] = processorMatch[1].trim();
    }
    
    // Extrai sistema operacional
    const systemMatch = descriptionText.match(/vem com ([^,]+Android[^,]+)/i);
    if (systemMatch) {
      specs['Sistema'] = systemMatch[1].trim();
    }
    
    // Extrai ano de lançamento
    const yearMatch = descriptionText.match(/lançado em (\d{2}\/\d{2}\/\d{4})/i);
    if (yearMatch) {
      specs['Data lançamento'] = yearMatch[1];
    }
    
    // Extrai memória RAM (pode ter múltiplos valores)
    // Ex: "12 GB, 16 GB e 24 GB de memória RAM"
    const ramMatch = descriptionText.match(/(\d+\s*GB(?:,\s*\d+\s*GB)*(?:\s*e\s*\d+\s*GB)?)\s+de memória RAM/i);
    if (ramMatch) {
      specs['Memória RAM'] = ramMatch[1].trim();
    }
    
    // Extrai armazenamento (pode ter múltiplos valores)
    // Ex: "128 GB, 256 GB, 512 GB" ou "256 GB, 512 GB e 1 TB"
    const storageMatch = descriptionText.match(/(\d+\s*(?:GB|TB)(?:,\s*\d+\s*(?:GB|TB))*(?:\s*e\s*\d+\s*(?:GB|TB)?)?)[,\s]*(?:UFS|de armazenamento)/i);
    if (storageMatch) {
      specs['Armazenamento'] = storageMatch[1].trim();
    }
    
    // Extrai tela
    const screenMatch = descriptionText.match(/tela ([^,]+\d+\.?\d*\s*polegadas)/i);
    if (screenMatch) {
      specs['Tela'] = screenMatch[1].trim();
    }
    
    // Extrai bateria
    const batteryMatch = descriptionText.match(/bateria de (\d+\s*mAh)/i);
    if (batteryMatch) {
      specs['Bateria'] = batteryMatch[1];
    }
    
    // Detecta 5G/4G/3G - busca no HTML completo para pegar tabela de redes
    if (fullHtmlText.match(/5G[^<]*Sim/i) || fullHtmlText.match(/<div[^>]*>5G<\/div>[^<]*<div[^>]*>Sim<\/div>/i)) {
      specs['5G'] = 'Sim';
      console.log('📡 5G detectado!');
    }
    if (fullHtmlText.match(/4G[^<]*Sim/i) || fullHtmlText.match(/<div[^>]*>4G<\/div>[^<]*<div[^>]*>Sim<\/div>/i)) {
      specs['4G'] = 'Sim';
      console.log('📡 4G detectado!');
    }
    if (fullHtmlText.match(/3G[^<]*Sim/i) || fullHtmlText.match(/<div[^>]*>3G<\/div>[^<]*<div[^>]*>Sim<\/div>/i)) {
      specs['3G'] = 'Sim';
      console.log('📡 3G detectado!');
    }
  }

  console.log(`📋 Specs extraídos: ${Object.keys(specs).length} campos`);
  console.log('📝 Specs encontrados:', Object.keys(specs).join(', '));
  if (Object.keys(specs).length > 0) {
    console.log('📊 Dados:', JSON.stringify(specs, null, 2));
  }

  return parseSpecs(specs, phoneSlug);
}

function parseSpecs(specs, slug) {
  console.log('🔄 Processando specs extraídos...');
  
  // Oficinadanet pode ter "Memórias" contendo tanto RAM quanto Storage
  const memoriasText = specs['Memórias'] || specs['Memória'] || '';
  
  // Separa RAM de Storage da string de memórias
  let ramOptions = [];
  let storageOptions = [];
  
  if (memoriasText) {
    // Extrai valores que parecem ser RAM (geralmente menores, 4-16 GB)
    const ramMatches = memoriasText.match(/(\d+)\s*GB/gi);
    if (ramMatches) {
      ramMatches.forEach(match => {
        const value = parseInt(match.replace(/\s*GB/i, ''));
        if (value <= 24) { // RAM geralmente até 24GB
          const ramStr = value.toString();
          if (!ramOptions.includes(ramStr)) ramOptions.push(ramStr);
        } else { // Storage geralmente acima de 24GB
          const storageStr = value.toString();
          if (!storageOptions.includes(storageStr)) storageOptions.push(storageStr);
        }
      });
    }
  }
  
  // Se não encontrou nada, tenta em campos separados
  if (ramOptions.length === 0) {
    ramOptions = extractRAMOptions(specs['Memória RAM'] || specs['RAM'] || '');
  }
  if (storageOptions.length === 0) {
    storageOptions = extractStorageOptions(specs['Armazenamento'] || specs['Storage'] || specs['Armazenamento interno'] || '');
  }
  
  console.log(`💾 RAM encontradas: ${ramOptions.join(', ')}`);
  console.log(`💿 Storage encontrados: ${storageOptions.join(', ')}`);
  
  const processor = specs['Processador'] || specs['Chipset'] || specs['CPU'] || '';
  const system = specs['Sistema'] || specs['Sistema Operacional'] || specs['OS'] || '';
  const battery = specs['Bateria'] || specs['Battery'] || '';
  const year = extractYear(specs['Data lançamento'] || specs['Lançamento'] || specs['Data de lançamento'] || '');
  const broadband = extractBroadband(specs);
  
  console.log(`🔧 Processador: ${processor}`);
  console.log(`📅 Ano: ${year}`);
  console.log(`📡 Conexão: ${broadband}`);
  
  const phoneTitle = slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  // Extrai a marca do título (primeira palavra do slug)
  const brand = slug.split('-')[0];
  const brandName = brand.charAt(0).toUpperCase() + brand.slice(1);

  const variations = generateVariations(
    ramOptions,
    storageOptions,
    processor,
    broadband,
    year
  );
  
  console.log(`✅ ${variations.length} variações geradas`);
  console.log(`🏢 Marca detectada: ${brandName}`);

  return {
    deviceTitle: phoneTitle,
    deviceBrand: brandName,
    deviceProcessor: processor,
    deviceYear: year,
    deviceBroadband: broadband,
    system: system,
    screen: {
      size: specs['Tela'] || specs['Display'] || '',
      resolution: specs['Resolução'] || '',
      type: specs['Tipo de tela'] || '',
      refresh: specs['Taxa de atualização'] || ''
    },
    camera: {
      main: specs['Câmera'] || specs['Câmera traseira'] || specs['Câmera principal'] || '',
      front: specs['Câmera frontal'] || specs['Selfie'] || ''
    },
    battery: battery,
    dimensions: specs['Dimensões'] || '',
    weight: specs['Peso'] || '',
    variations: variations,
    allSpecs: specs
  };
}

function extractRAMOptions(ramText) {
  const rams = [];
  
  // Remove "e" e split por vírgula para pegar todos os valores
  // Ex: "4 GB, 6 GB e 8 GB" ou "8 GB"
  const cleanText = ramText.replace(/\s+e\s+/gi, ', ');
  const parts = cleanText.split(',');
  
  parts.forEach(part => {
    const matches = part.match(/(\d+)\s*GB/i);
    if (matches) {
      const ram = matches[1].trim();
      if (ram && !rams.includes(ram)) {
        rams.push(ram);
      }
    }
  });
  
  return rams.length > 0 ? rams : ['4'];
}

function extractStorageOptions(storageText) {
  const storages = [];
  
  // Remove "e" e split por vírgula para pegar todos os valores
  // Ex: "256 GB, 512 GB e 1 TB"
  const cleanText = storageText.replace(/\s+e\s+/gi, ', ');
  const parts = cleanText.split(',');
  
  parts.forEach(part => {
    // Suporta GB e TB
    const gbMatch = part.match(/(\d+)\s*GB/i);
    const tbMatch = part.match(/(\d+)\s*TB/i);
    
    if (tbMatch) {
      // Converte TB para GB (1 TB = 1000 GB para compatibilidade com o banco)
      const tbValue = parseInt(tbMatch[1]);
      const gbValue = (tbValue * 1000).toString();
      if (!storages.includes(gbValue)) {
        storages.push(gbValue);
      }
    } else if (gbMatch) {
      const storage = gbMatch[1].trim();
      if (storage && !storages.includes(storage)) {
        storages.push(storage);
      }
    }
  });
  
  return storages.length > 0 ? storages : ['128'];
}

function extractYear(dateText) {
  const match = dateText.match(/\d{4}/);
  return match ? match[0] : new Date().getFullYear().toString();
}

function extractBroadband(specs) {
  // Monta string com combinações baseado em quais redes estão disponíveis
  const has3G = specs['3G'] === 'Sim';
  const has4G = specs['4G'] === 'Sim';
  const has5G = specs['5G'] === 'Sim';
  
  // Todas as três
  if (has3G && has4G && has5G) return '3G/4G/5G';
  
  // Combinações de duas
  if (has4G && has5G) return '4G/5G';
  if (has3G && has4G) return '3G/4G';
  
  // Individuais
  if (has5G) return '5G';
  if (has4G) return '4G';
  if (has3G) return '3G';
  
  // Fallback
  return '4G';
}

function generateVariations(ramOptions, storageOptions, processor, broadband, year) {
  const variations = [];
  let id = 1;

  ramOptions.forEach(ram => {
    storageOptions.forEach(storage => {
      variations.push({
        id: id++,
        deviceVersion: "", // Campo para código do modelo (ex: SM-G988B) - deixar vazio
        deviceProcessor: processor,
        deviceMemory: ram,
        deviceStorage: storage,
        deviceBroadband: broadband,
        deviceYear: year,
        devicePrice: {
          new: { minValue: 0, medValue: 0, maxValue: 0 },
          used: { minValue: 0, medValue: 0, maxValue: 0 }
        }
      });
    });
  });

  return variations;
}

function formatSlug(searchTerm) {
  return searchTerm
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// Endpoint para buscar telefone
app.post('/api/search-phone', async (req, res) => {
  try {
    const { searchTerm } = req.body;
    
    if (!searchTerm) {
      return res.status(400).json({
        success: false,
        message: 'Nome do telefone é obrigatório'
      });
    }

    const slug = formatSlug(searchTerm);
    const url = `https://www.oficinadanet.com.br/smartphones/${slug}`;
    
    console.log(`🔍 Buscando: ${url}`);
    
    const { data } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
      timeout: 15000
    });

    // Salva HTML para debug
    const debugDir = path.join(__dirname, 'debug');
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir);
    }
    const htmlPath = path.join(debugDir, `${slug}.html`);
    fs.writeFileSync(htmlPath, data, 'utf8');
    console.log(`💾 HTML salvo em: ${htmlPath}`);
    console.log(`📄 Tamanho do HTML: ${data.length} caracteres`);

    const phoneData = scrapePhone(data, slug);
    
    console.log(`✅ Dados extraídos: ${phoneData.variations.length} variações`);
    console.log('📦 Dados completos:', JSON.stringify(phoneData, null, 2));
    
    res.json({
      success: true,
      data: phoneData,
      message: 'Dados do telefone encontrados com sucesso!'
    });
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    
    if (error.response?.status === 404) {
      return res.status(404).json({
        success: false,
        message: 'Telefone não encontrado. Verifique o nome e tente novamente.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: `Erro ao buscar telefone: ${error.message}`
    });
  }
});

// Endpoint de autocomplete usando Puppeteer
app.get('/api/autocomplete', async (req, res) => {
  let browser;
  try {
    const { name } = req.query;
    
    if (!name || name.length < 3) {
      return res.json({ success: true, results: [] });
    }

    console.log(`🔍 Buscando sugestões para: ${name}`);
    
    const encodedName = encodeURIComponent(name);
    const kimovilUrl = `https://www.kimovil.com/_json/autocomplete_devicemodels_joined.json?device_type=0&name=${encodedName}`;
    
    // Inicia navegador headless
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Configura user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Acessa a URL
    const response = await page.goto(kimovilUrl, { waitUntil: 'networkidle2' });
    const jsonText = await page.evaluate(() => document.body.textContent);
    const data = JSON.parse(jsonText);
    
    await browser.close();
    
    // Filtra apenas smartphones
    const smartphones = data.results
      .filter(item => item.type === 0 && item.result_type === 'smartphones')
      .slice(0, 8);
    
    console.log(`✅ ${smartphones.length} sugestões encontradas`);
    
    res.json({
      success: true,
      results: smartphones
    });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('❌ Erro ao buscar autocomplete:', error.message);
    res.status(500).json({
      success: false,
      message: 'Erro ao buscar sugestões',
      results: []
    });
  }
});

// Endpoint para scraping da Kimovil usando Puppeteer
app.get('/api/scrape-kimovil', async (req, res) => {
  let browser;
  try {
    const { url } = req.query;
    
    if (!url) {
      return res.status(400).json({
        success: false,
        message: 'URL é obrigatória'
      });
    }

    console.log(`\n🔍 Scraping da Kimovil: ${url}`);
    
    // Constrói a URL completa da Kimovil
    const kimovilUrl = `https://www.kimovil.com/pt/onde-comprar-${url}`;
    console.log(`📡 URL completa: ${kimovilUrl}`);
    
    // Inicia navegador headless
    browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Configura user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Acessa a página
    console.log('🌐 Abrindo página no navegador...');
    await page.goto(kimovilUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    
    // Extrai o HTML da página
    const html = await page.content();
    await browser.close();
    browser = null;
    
    console.log('📄 HTML carregado, extraindo dados...');
    const $ = cheerio.load(html);
    
    // Extrai título
    const titleMeta = $('meta[property="og:title"]').attr('content');
    const deviceTitle = titleMeta ? titleMeta.split(':')[0].trim() : '';
    console.log(`📱 Título: ${deviceTitle}`);
    
    // Extrai marca (primeiro nome antes do espaço)
    const brand = deviceTitle.split(' ')[0];
    console.log(`🏢 Marca: ${brand}`);
    
    // Extrai descrição completa
    const description = $('meta[name="description"]').attr('content') || '';
    
    // Extrai variações da tabela version-prices-table (Versões e preços)
    const allVariations = { global: [], china: [], others: [] };
    
    $('#js_version-prices-table tr').each((i, elem) => {
      const th = $(elem).find('th').first();
      if (th.length > 0) {
        const fullText = th.text().trim();
        
        // Remove o nome do dispositivo e o dot, mantendo apenas a parte da variação
        // Exemplo: "Samsung Galaxy Z TriFold • Global · 16GB · 512GB · SM-D639B"
        const parts = fullText.split('•');
        if (parts.length > 1) {
          const versionText = parts[1].trim();
          
          // Remove código do modelo (ex: SM-D639B)
          const cleanVersion = versionText.replace(/\s*·\s*[A-Z]{2}-[A-Z0-9]+\s*$/, '').trim();
          
          // Separa por região
          if (versionText.includes('Global')) {
            allVariations.global.push(cleanVersion);
          } else if (versionText.includes('China')) {
            allVariations.china.push(cleanVersion);
          } else {
            allVariations.others.push(cleanVersion);
          }
        }
      }
    });
    
    // Prioriza Global, se não houver usa China, senão usa outras
    let variations = [];
    if (allVariations.global.length > 0) {
      variations = allVariations.global;
      console.log(`📊 Variações Global encontradas: ${variations.length}`);
    } else if (allVariations.china.length > 0) {
      variations = allVariations.china;
      console.log(`📊 Variações China encontradas: ${variations.length} (sem versão Global disponível)`);
    } else {
      variations = allVariations.others;
      console.log(`📊 Outras variações encontradas: ${variations.length}`);
    }
    
    variations.forEach((v, i) => console.log(`  ${i + 1}. ${v}`));
    
    // Extrai especificações técnicas do HTML
    let processor = '';
    let year = '';
    let broadband = '';
    
    // Procura processador na tabela k-dltable
    const processorTable = $('.k-dltable tbody tr').filter((i, elem) => {
      return $(elem).find('th').text().trim().toLowerCase() === 'modelo';
    }).find('td').text().trim();
    
    if (processorTable) {
      processor = processorTable;
      console.log(`🔧 Processador (tabela): ${processor}`);
    } else {
      // Fallback para regex se não encontrar na tabela
      const processorMatch = description.match(/Processador:\s*([^,]+)/i) || 
                            html.match(/Processador[^:]*:\s*([^<,\n]+)/i);
      if (processorMatch) {
        processor = processorMatch[1].trim();
        console.log(`🔧 Processador (regex): ${processor}`);
      }
    }
    
    // Extrai ano de lançamento da tabela "Lançamento"
    $('h3.k-h4, h2.k-h3').each((i, elem) => {
      const title = $(elem).text().trim();
      if (/Lançamento/i.test(title)) {
        // Encontrou seção de lançamento, procura tabela seguinte
        const table = $(elem).nextAll('table.k-dltable').first();
        
        table.find('tbody tr').each((j, row) => {
          const th = $(row).find('th').text().trim();
          if (/^Lançamento$/i.test(th)) {
            const td = $(row).find('td').text().trim();
            // Exemplo: "Dezembro 2025, 11 dias atrás"
            const yearMatch = td.match(/\b(20\d{2})\b/);
            if (yearMatch) {
              year = yearMatch[1];
              console.log(`📅 Ano: ${year}`);
            }
          }
        });
      }
    });
    
    // Extrai conectividade da tabela de bandas (ignora 2G)
    let has5G = false;
    let has4G = false;
    let has3G = false;
    
    // Procura pela tabela de conectividade
    $('h2.k-h3, h3.k-h4').each((i, elem) => {
      const title = $(elem).text().trim();
      if (/Conectividade|Bandas/i.test(title)) {
        // Encontrou seção de conectividade, procura tabela seguinte
        const table = $(elem).nextAll('table.k-dltable').first();
        
        table.find('tbody tr').each((j, row) => {
          const th = $(row).find('th').text().trim();
          
          // Ignora 2G
          if (/^2G$/i.test(th)) {
            return; // continue
          }
          
          // Verifica 5G
          if (/5G|NR/i.test(th)) {
            has5G = true;
          }
          
          // Verifica 4G
          if (/4G|LTE/i.test(th)) {
            has4G = true;
          }
          
          // Verifica 3G
          if (/^3G$/i.test(th)) {
            has3G = true;
          }
        });
      }
    });
    
    // Monta string de conexão baseado nas bandas encontradas
    if (has5G && has4G && has3G) broadband = '3G/4G/5G';
    else if (has5G && has4G) broadband = '4G/5G';
    else if (has4G && has3G) broadband = '3G/4G';
    else if (has5G) broadband = '5G';
    else if (has4G) broadband = '4G';
    else if (has3G) broadband = '3G';
    else broadband = '4G'; // fallback
    
    console.log(`📡 Conexão: ${broadband}`);
    
    // Processa variações e extrai RAM/Storage
    const processedVariations = [];
    
    variations.forEach((versionText, index) => {
      // Exemplo: "Global · 6GB · 128GB" ou "China · 8GB · 256GB"
      const parts = versionText.split('·').map(p => p.trim());
      
      let ram = '';
      let storage = '';
      
      // Procura RAM e Storage nos parts
      parts.forEach(part => {
        if (/^\d+GB$/.test(part) && !ram) {
          ram = part.replace('GB', '');
        } else if (/^\d+GB$/.test(part) && ram) {
          storage = part.replace('GB', '');
        } else if (/^\d+TB$/.test(part)) {
          const tb = parseInt(part.replace('TB', ''));
          storage = String(tb * 1000);
        }
      });
      
      if (ram && storage) {
        processedVariations.push({
          id: index + 1,
          deviceVersion: '',
          deviceProcessor: processor,
          deviceMemory: ram,
          deviceStorage: storage,
          deviceBroadband: broadband,
          deviceYear: year,
          devicePrice: {
            new: { minValue: 0, medValue: 0, maxValue: 0 },
            used: { minValue: 0, medValue: 0, maxValue: 0 }
          }
        });
      }
    });
    
    console.log(`✅ ${processedVariations.length} variações processadas`);
    
    // Extrai primeira imagem da galeria
    let deviceImage = '';
    const firstImageHref = $('.device-photos-list .item.image a.kigallery').first().attr('href');
    if (firstImageHref) {
      deviceImage = firstImageHref.startsWith('//') ? `https:${firstImageHref}` : firstImageHref;
      console.log(`📷 Imagem: ${deviceImage}`);
    }
    
    const phoneData = {
      deviceTitle,
      deviceBrand: brand,
      deviceProcessor: processor,
      deviceYear: year,
      deviceBroadband: broadband,
      deviceImage,
      variations: processedVariations,
      source: 'kimovil'
    };
    
    res.json({
      success: true,
      data: phoneData,
      message: 'Dados extraídos com sucesso da Kimovil!'
    });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('❌ Erro ao fazer scraping da Kimovil:', error.message);
    res.status(500).json({
      success: false,
      message: `Erro ao buscar dados: ${error.message}`
    });
  }
});

// Endpoint para buscar preços da OLX
app.get('/api/scrape-olx', async (req, res) => {
  let browser;
  
  try {
    const { deviceName, storage } = req.query;
    
    if (!deviceName || !storage) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetros deviceName e storage são obrigatórios'
      });
    }
    
    // Remove "Apple" da busca se for produto Apple (melhora resultados na OLX)
    const deviceNameForSearch = deviceName.replace(/^Apple\s+/i, '').trim();
    
    // Monta query de busca: "nome armazenamento"
    const searchQuery = `${deviceNameForSearch} ${storage}`;
    const encodedQuery = encodeURIComponent(searchQuery);
    const olxUrl = `https://www.olx.com.br/celulares?q=${encodedQuery}&elcd=3&elcd=2`;
    
    console.log(`🔍 Buscando preços na OLX: ${searchQuery}`);
    console.log(`🔗 URL: ${olxUrl}`);
    
    // Abre navegador com Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('🌐 Abrindo página da OLX...');
    await page.goto(olxUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    
    // Aguarda a página carregar (espera 3 segundos para JS renderizar)
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log('💰 Extraindo anúncios com título e preço...');
    
    // Extrai anúncios com título e preço para filtrar corretamente
    const ads = await page.evaluate(() => {
      const extractedAds = [];
      
      // Busca todos os cards de anúncios
      const adCards = document.querySelectorAll('section[data-ds-component="DS-AdCard"], section.olx-ad-card, section[class*="ad"]');
      
      adCards.forEach(card => {
        // Tenta encontrar o título
        const titleElement = card.querySelector('h2, [class*="title"], a[data-lurker]');
        const title = titleElement ? titleElement.textContent.trim() : '';
        
        // Tenta encontrar o preço
        const priceElement = card.querySelector('h3, [class*="price"], span[class*="price"]');
        const priceText = priceElement ? priceElement.textContent.trim() : '';
        
        // Extrai o preço numérico
        const match = priceText.match(/R\$\s*([\d.]+)/);
        if (match && title) {
          const price = parseInt(match[1].replace(/\./g, ''));
          if (price > 0 && price < 100000) {
            extractedAds.push({ title, price });
          }
        }
      });
      
      return extractedAds;
    });
    
    console.log(`📊 Total de anúncios encontrados: ${ads.length}`);
    
    // Filtra anúncios que realmente são do modelo e armazenamento correto
    // Remove "Apple" da validação também (só valida o modelo)
    const deviceNameWords = deviceNameForSearch.toLowerCase().split(' ').filter(w => w.length > 2);
    const storageMatch = storage.match(/(\d+)(GB|TB)/i);
    const storageValue = storageMatch ? storageMatch[1] : null;
    const storageUnit = storageMatch ? storageMatch[2].toUpperCase() : null;
    
    const filteredPrices = ads
      .filter(ad => {
        const titleLower = ad.title.toLowerCase();
        
        // Ignora acessórios comuns
        const isAccessory = /carregador|capa|pelicula|fone|cabo|fonte|bateria|tela|capinha|suporte|adaptador|película/i.test(titleLower);
        if (isAccessory) {
          return false;
        }
        
        // OBRIGATÓRIO: Título deve conter TODAS as palavras do modelo (não apenas algumas)
        // Ex: "iPhone Air" precisa ter "iphone" E "air", não aceita só "iphone"
        const hasAllModelWords = deviceNameWords.every(word => titleLower.includes(word));
        if (!hasAllModelWords) {
          return false;
        }
        
        // NOVO: Rejeita se título contém variantes que não estão na busca
        // Ex: busca "iPhone 17 Pro" não pode aceitar "iPhone 17 Pro Max"
        const modelVariants = ['max', 'plus', 'mini', 'ultra', 'lite', 'air', 'se', 'edge', 'note', 'fold', 'flip'];
        const deviceNameLower = deviceNameForSearch.toLowerCase();
        
        for (const variant of modelVariants) {
          const titleHasVariant = titleLower.includes(variant);
          const searchHasVariant = deviceNameLower.includes(variant);
          
          // Se título tem a variante mas busca não tem, rejeita
          if (titleHasVariant && !searchHasVariant) {
            return false;
          }
        }
        
        // Verifica se título contém o armazenamento correto
        if (storageValue && storageUnit) {
          const storageRegex = new RegExp(`\\b${storageValue}\\s*${storageUnit}\\b`, 'i');
          if (!storageRegex.test(ad.title)) {
            return false;
          }
        }
        
        return true;
      })
      .map(ad => ad.price);
    
    const prices = [...new Set(filteredPrices)]; // Remove duplicatas
    
    console.log(`✅ Anúncios filtrados: ${prices.length} (de ${ads.length} totais)`);
    
    await browser.close();
    browser = null;
    
    if (prices.length === 0) {
      console.log('⚠️ Nenhum preço encontrado');
      return res.json({
        success: true,
        data: {
          minValue: 0,
          medValue: 0,
          maxValue: 0,
          count: 0
        },
        message: 'Nenhum preço encontrado na OLX'
      });
    }
    
    // Calcula mínimo, máximo e média
    const minValue = Math.min(...prices);
    const maxValue = Math.max(...prices);
    const medValue = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    
    console.log(`✅ ${prices.length} preços encontrados`);
    console.log(`💵 Mínimo: R$ ${minValue}`);
    console.log(`💵 Médio: R$ ${medValue}`);
    console.log(`💵 Máximo: R$ ${maxValue}`);
    
    res.json({
      success: true,
      data: {
        minValue,
        medValue,
        maxValue,
        count: prices.length
      },
      message: `${prices.length} preços encontrados na OLX`
    });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('❌ Erro ao buscar preços na OLX:', error.message);
    res.status(500).json({
      success: false,
      message: `Erro ao buscar preços: ${error.message}`
    });
  }
});

// Endpoint para buscar preços da Amazon
app.get('/api/scrape-amazon', async (req, res) => {
  let browser;
  
  try {
    const { deviceName, storage } = req.query;
    
    if (!deviceName || !storage) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetros deviceName e storage são obrigatórios'
      });
    }
    
    // Monta query de busca: "nome armazenamento"
    const searchQuery = `${deviceName} ${storage}`;
    const encodedQuery = encodeURIComponent(searchQuery);
    const amazonUrl = `https://www.amazon.com.br/s?k=${encodedQuery}`;
    
    console.log(`🔍 Buscando preços na Amazon: ${searchQuery}`);
    console.log(`🔗 URL: ${amazonUrl}`);
    
    // Abre navegador com Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('🌐 Abrindo página da Amazon...');
    await page.goto(amazonUrl, { waitUntil: 'networkidle0', timeout: 45000 });
    
    // Aguarda a página carregar e faz scroll para carregar lazy loading
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Scroll na página para carregar todos os produtos
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('💰 Extraindo produtos com título e preço...');
    
    // Extrai produtos com título e preço
    const products = await page.evaluate(() => {
      const extractedProducts = [];
      
      // Busca todos os possíveis containers de produtos
      const productCards = document.querySelectorAll(
        '[data-component-type="s-search-result"], ' +
        '.s-result-item[data-asin], ' +
        'div[data-asin]:not([data-asin=""]), ' +
        '.s-card-container, ' +
        '[cel_widget_id*="SEARCH"]'
      );
      
      productCards.forEach(card => {
        // Ignora cards sem ASIN válido
        const asin = card.getAttribute('data-asin');
        if (!asin || asin === '') return;
        
        // Tenta encontrar o título com múltiplos seletores
        let title = '';
        const titleSelectors = [
          'h2 a.a-link-normal span',
          'h2 span.a-text-normal',
          'h2 a span',
          '.a-size-base-plus',
          '.a-size-medium'
        ];
        
        for (const selector of titleSelectors) {
          const titleElement = card.querySelector(selector);
          if (titleElement && titleElement.textContent.trim()) {
            title = titleElement.textContent.trim();
            break;
          }
        }
        
        // Tenta encontrar o preço com múltiplos seletores
        let priceText = '';
        const priceSelectors = [
          '.a-price .a-offscreen',
          '.a-price-whole',
          'span.a-price span[aria-hidden="true"]',
          '.a-price > span:first-child',
          'span[data-a-color="price"]'
        ];
        
        for (const selector of priceSelectors) {
          const priceElement = card.querySelector(selector);
          if (priceElement && priceElement.textContent.trim()) {
            priceText = priceElement.textContent.trim();
            break;
          }
        }
        
        // Extrai o preço numérico
        // Formato Amazon: "R$ 5.999,00" ou "R$5999" ou "5.999,00"
        const match = priceText.match(/R?\$?\s*([\d.]+)(?:,\d+)?/);
        if (match && title) {
          const price = parseInt(match[1].replace(/\./g, ''));
          if (price > 0 && price < 100000) {
            extractedProducts.push({ title, price });
          }
        }
      });
      
      return extractedProducts;
    });
    
    console.log(`📊 Total de produtos encontrados: ${products.length}`);
    
    // Filtra produtos que realmente são do modelo e armazenamento correto
    const deviceNameWords = deviceName.toLowerCase().split(' ').filter(w => w.length > 2);
    const storageMatch = storage.match(/(\d+)(GB|TB)/i);
    const storageValue = storageMatch ? storageMatch[1] : null;
    const storageUnit = storageMatch ? storageMatch[2].toUpperCase() : null;
    
    const filteredPrices = products
      .filter(product => {
        let title = product.title;
        
        // Remove cores comuns do título
        const colors = /\s*-?\s*(preto|branco|azul|vermelho|verde|amarelo|rosa|roxo|dourado|prateado|grafite|meia-noite|estelar|alpino|sierra|intenso|natural|titânio|deserto|areias?|midnight|starlight|alpine|sierra|blue|green|red|yellow|pink|purple|gold|silver|graphite|black|white|natural|titanium|desert)\s*$/i;
        title = title.replace(colors, '').trim();
        
        const titleLower = title.toLowerCase();
        
        // Ignora acessórios comuns
        const isAccessory = /carregador|capa|pelicula|fone|cabo|fonte|bateria|tela|capinha|suporte|adaptador|película/i.test(titleLower);
        if (isAccessory) {
          return false;
        }
        
        // OBRIGATÓRIO: Título deve conter TODAS as palavras do modelo (não apenas algumas)
        // Ex: "iPhone 17 Pro Max" precisa ter "iphone", "17", "pro" E "max"
        // Não aceita "iPhone 17 Pro" (falta max) ou "iPhone Air" quando busca "iPhone 17 Pro Max"
        const hasAllModelWords = deviceNameWords.every(word => titleLower.includes(word));
        if (!hasAllModelWords) {
          return false;
        }
        
        // NOVO: Rejeita se título contém variantes que não estão na busca
        // Ex: busca "iPhone 17 Pro" não pode aceitar "iPhone 17 Pro Max"
        const modelVariants = ['max', 'plus', 'mini', 'ultra', 'lite', 'air', 'se', 'edge', 'note', 'fold', 'flip'];
        const deviceNameLower = deviceName.toLowerCase();
        
        for (const variant of modelVariants) {
          const titleHasVariant = titleLower.includes(variant);
          const searchHasVariant = deviceNameLower.includes(variant);
          
          // Se título tem a variante mas busca não tem, rejeita
          if (titleHasVariant && !searchHasVariant) {
            return false;
          }
        }
        
        // Verifica se título contém o armazenamento correto
        // Aceita formatos: "256GB", "256 GB", "(256 GB)", "(256GB)"
        if (storageValue && storageUnit) {
          const storageRegex = new RegExp(`\\(?\\s*${storageValue}\\s*${storageUnit}\\s*\\)?`, 'i');
          if (!storageRegex.test(title)) {
            return false;
          }
        }
        
        return true;
      })
      .map(product => product.price);
    
    const prices = [...new Set(filteredPrices)]; // Remove duplicatas
    
    console.log(`✅ Produtos filtrados: ${prices.length} (de ${products.length} totais)`);
    
    await browser.close();
    browser = null;
    
    if (prices.length === 0) {
      console.log('⚠️ Nenhum preço encontrado');
      return res.json({
        success: true,
        data: {
          minValue: 0,
          medValue: 0,
          maxValue: 0,
          count: 0
        },
        message: 'Nenhum preço encontrado na Amazon'
      });
    }
    
    // Calcula mínimo, máximo e média
    const minValue = Math.min(...prices);
    const maxValue = Math.max(...prices);
    const medValue = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
    
    console.log(`✅ ${prices.length} preços encontrados`);
    console.log(`💵 Mínimo: R$ ${minValue}`);
    console.log(`💵 Médio: R$ ${medValue}`);
    console.log(`💵 Máximo: R$ ${maxValue}`);
    
    res.json({
      success: true,
      data: {
        minValue,
        medValue,
        maxValue,
        count: prices.length
      },
      message: `${prices.length} preços encontrados na Amazon`
    });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('❌ Erro ao buscar preços na Amazon:', error.message);
    res.status(500).json({
      success: false,
      message: `Erro ao buscar preços: ${error.message}`
    });
  }
});

// Endpoint para buscar preços do Mercado Livre
app.get('/api/scrape-mercadolivre', async (req, res) => {
  let browser;
  
  try {
    const { deviceName, storage } = req.query;
    
    if (!deviceName || !storage) {
      return res.status(400).json({
        success: false,
        message: 'Parâmetros deviceName e storage são obrigatórios'
      });
    }
    
    // Remove "Apple" se for produto Apple (igual OLX)
    const deviceNameForSearch = deviceName.replace(/^Apple\s+/i, '').trim();
    
    // Formata query para URL: "iphone-air-256"
    const searchQuery = `${deviceNameForSearch} ${storage}`.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/gb|tb/gi, '');
    
    const mlUrl = `https://lista.mercadolivre.com.br/celulares-smartphones/novo/${searchQuery}`;
    
    console.log(`🔍 Buscando preços no Mercado Livre: ${deviceName} ${storage}`);
    console.log(`🔗 URL: ${mlUrl}`);
    
    // Abre navegador com Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('🌐 Abrindo página do Mercado Livre...');
    // Aguarda networkidle0 para garantir que o redirecionamento foi concluído
    await page.goto(mlUrl, { waitUntil: 'networkidle0', timeout: 45000 });
    
    // URL após redirecionamento
    const finalUrl = page.url();
    console.log('🔗 URL após redirecionamento:', finalUrl);
    
    // Aguarda página carregar completamente (5 segundos para garantir JS)
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Scroll na página para carregar lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    console.log('💰 Extraindo produtos com título e preço...');
    
    // Extrai produtos do HTML
    const products = await page.evaluate(() => {
      const extractedProducts = [];
      
      // Busca todos os cards de produtos
      const productCards = document.querySelectorAll('li.ui-search-layout__item, div.ui-search-result__wrapper');
      
      productCards.forEach(card => {
        // Título do produto
        const titleElement = card.querySelector('h2.ui-search-item__title, a.ui-search-link');
        const title = titleElement ? titleElement.textContent.trim() : '';
        
        // Preço do produto
        const priceElement = card.querySelector('span.andes-money-amount__fraction, span.price-tag-fraction');
        const priceText = priceElement ? priceElement.textContent.trim() : '';
        
        if (title && priceText) {
          const price = parseInt(priceText.replace(/\./g, '').replace(/\D/g, ''));
          if (price > 0 && price < 100000) {
            extractedProducts.push({ title, price });
          }
        }
      });
      
      return extractedProducts;
    });
    
    console.log(`📊 Total de produtos encontrados: ${products.length}`);
    
    await browser.close();
    browser = null;
    
    // Filtra produtos que realmente são do modelo e armazenamento correto
    const deviceNameWords = deviceNameForSearch.toLowerCase().split(' ').filter(w => w.length > 2);
    const storageMatch = storage.match(/(\d+)(GB|TB)/i);
    const storageValue = storageMatch ? storageMatch[1] : null;
    const storageUnit = storageMatch ? storageMatch[2].toUpperCase() : null;
    
    const filteredPrices = products
      .filter(product => {
        const titleLower = product.title.toLowerCase();
        
        // Ignora acessórios
        const isAccessory = /carregador|capa|pelicula|fone|cabo|fonte|bateria|tela|capinha|suporte|adaptador|película/i.test(titleLower);
        if (isAccessory) {
          return false;
        }
        
        // Deve conter TODAS as palavras do modelo
        const hasAllModelWords = deviceNameWords.every(word => titleLower.includes(word));
        if (!hasAllModelWords) {
          return false;
        }
        
        // Rejeita se título contém variantes que não estão na busca
        const modelVariants = ['max', 'plus', 'mini', 'ultra', 'lite', 'air', 'se', 'edge', 'note', 'fold', 'flip'];
        const deviceNameLower = deviceNameForSearch.toLowerCase();
        
        for (const variant of modelVariants) {
          const titleHasVariant = titleLower.includes(variant);
          const searchHasVariant = deviceNameLower.includes(variant);
          
          if (titleHasVariant && !searchHasVariant) {
            return false;
          }
        }
        
        // Verifica armazenamento correto
        if (storageValue && storageUnit) {
          const storageRegex = new RegExp(`\\b${storageValue}\\s*${storageUnit}\\b`, 'i');
          if (!storageRegex.test(product.title)) {
            return false;
          }
        }
        
        return true;
      })
      .map(product => product.price);
    
    console.log(`✅ Produtos filtrados: ${filteredPrices.length} (de ${products.length} totais)`);
    
    if (filteredPrices.length === 0) {
      console.log('⚠️ Nenhum preço encontrado');
      return res.json({
        success: true,
        data: {
          minValue: 0,
          medValue: 0,
          maxValue: 0,
          count: 0
        },
        message: 'Nenhum preço encontrado no Mercado Livre'
      });
    }
    
    // Calcula mínimo, máximo e média
    const minValue = Math.min(...filteredPrices);
    const maxValue = Math.max(...filteredPrices);
    const medValue = Math.round(filteredPrices.reduce((a, b) => a + b, 0) / filteredPrices.length);
    
    console.log(`✅ ${filteredPrices.length} preços encontrados`);
    console.log(`💵 Mínimo: R$ ${minValue}`);
    console.log(`💵 Médio: R$ ${medValue}`);
    console.log(`💵 Máximo: R$ ${maxValue}`);
    
    res.json({
      success: true,
      data: {
        minValue,
        medValue,
        maxValue,
        count: filteredPrices.length
      },
      message: `${filteredPrices.length} preços encontrados no Mercado Livre`
    });
    
  } catch (error) {
    if (browser) await browser.close();
    console.error('❌ Erro ao buscar preços no Mercado Livre:', error.message);
    res.status(500).json({
      success: false,
      message: `Erro ao buscar preços: ${error.message}`
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Phone Scraper Server rodando!' });
});

app.listen(PORT, () => {
  console.log(`🚀 Phone Scraper Server rodando na porta ${PORT}`);
  console.log(`📡 Endpoint: http://localhost:${PORT}/api/search-phone`);
  console.log(`✅ CORS habilitado para o frontend`);
});
