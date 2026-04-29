// ==============================================================
// MULTIEXPO — QR Code Backend
// Cole este código em script.google.com
// Após publicar como Web App, cole a URL em script.js → WEBHOOK_URL
// ==============================================================

const SHEET_ID   = '1grjGZU3-KnSC9pWxKZbBfCfwHqV_NAtwpD09cE0EWmw';
const SHEET_NAME = 'Registros';

const CABECALHO = [
  'ID', 'Data/Hora', 'Estande', 'CNPJ', 'CNPJ Formatado',
  'Valor (R$)', 'Tipo Transação', 'Avaliação (0-10)',
  'IP', 'Flag Suspeito', 'Status Sorteio'
];

// ==============================================================
// doPost — recebe os dados do formulário
// ==============================================================
function doGet(e) {
  try {
    const p = e.parameter;

    // Se não vier parâmetros é um health check
    if (!p || !p.cnpj) {
      return ContentService
        .createTextOutput('Multiexpo QR Code API — OK')
        .setMimeType(ContentService.MimeType.TEXT);
    }

    const dados = {
      numero_estande:       p.estande,
      cnpj:                 p.cnpj,
      cnpj_formatado:       p.cnpj_fmt,
      valor_aproximado:     parseFloat(p.valor),
      tipo_transacao:       p.tipo,
      avaliacao_atendimento: parseInt(p.avaliacao),
      ip_address:           p.ip,
      data_hora:            p.data_hora
    };

    const sheet = obterAba();

    if (sheet.getLastRow() === 0) {
      sheet.appendRow(CABECALHO);
      sheet.getRange(1, 1, 1, CABECALHO.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    const flagSuspeito = verificarFraude(sheet, dados);
    const id = sheet.getLastRow();

    const tipoFormatado = dados.tipo_transacao === 'compra'
      ? 'Compra efetuada'
      : 'Somente negociação';

    sheet.appendRow([
      id,
      dados.data_hora,
      dados.numero_estande,
      dados.cnpj,
      dados.cnpj_formatado,
      dados.valor_aproximado,
      tipoFormatado,
      dados.avaliacao_atendimento,
      dados.ip_address,
      flagSuspeito ? 'SUSPEITO' : '',
      'valido'
    ]);

    if (flagSuspeito) {
      sheet.getRange(sheet.getLastRow(), 10).setBackground('#fef9c3');
    }

    return resposta({ status: 'ok', id: id });

  } catch (err) {
    return resposta({ status: 'erro', mensagem: err.message });
  }
}

function doPost(e) {
  // Form submit envia em e.parameter (form-encoded)
  if (e && e.parameter && e.parameter.cnpj) return doGet(e);
  // Fallback JSON
  try {
    const p = JSON.parse(e.postData.contents);
    e.parameter = p;
    return doGet(e);
  } catch {
    return doGet(e);
  }
}

// ==============================================================
// Antifraude server-side
// ==============================================================
function verificarFraude(sheet, dados) {
  const ultimaLinha = sheet.getLastRow();
  if (ultimaLinha < 2) return false; // só cabeçalho, sem dados ainda

  const linhas = sheet.getRange(2, 1, ultimaLinha - 1, CABECALHO.length).getValues();
  const agora = new Date();

  const limite24h   = new Date(agora.getTime() - 24 * 60 * 60 * 1000);
  const limite30min = new Date(agora.getTime() - 30 * 60 * 1000);

  const cnpjsDoIP = new Set();
  cnpjsDoIP.add(dados.cnpj);

  const tipoFormatado = dados.tipo_transacao === 'compra'
    ? 'Compra efetuada'
    : 'Somente negociação';

  for (const linha of linhas) {
    // Colunas: [ID, Data/Hora, Estande, CNPJ, CNPJ_fmt, Valor, Tipo, Aval, IP, Flag, Status]
    //           0    1         2        3      4          5      6     7    8    9     10
    const dataLinha  = new Date(linha[1]);
    const estLinha   = String(linha[2]);
    const cnpjLinha  = String(linha[3]);
    const valorLinha = parseFloat(linha[5]);
    const tipoLinha  = String(linha[6]);
    const ipLinha    = String(linha[8]);

    if (isNaN(dataLinha.getTime())) continue;

    // Regra 1: mesmo CNPJ + estande + valor + tipo no mesmo dia
    if (
      cnpjLinha  === dados.cnpj &&
      estLinha   === String(dados.numero_estande) &&
      valorLinha === dados.valor_aproximado &&
      tipoLinha  === tipoFormatado &&
      dataLinha  >= limite24h
    ) {
      return true;
    }

    // Regra 2: múltiplos CNPJs do mesmo IP em 30 min
    if (ipLinha === dados.ip_address && dataLinha >= limite30min) {
      cnpjsDoIP.add(cnpjLinha);
    }
  }

  if (cnpjsDoIP.size >= 5) return true;

  return false;
}

// ==============================================================
// Helpers
// ==============================================================
function obterAba() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function resposta(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
