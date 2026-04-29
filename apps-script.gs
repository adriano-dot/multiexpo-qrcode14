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
function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    const sheet = obterAba();

    // Criar cabeçalho se a aba estiver vazia
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(CABECALHO);
      sheet.getRange(1, 1, 1, CABECALHO.length).setFontWeight('bold');
      sheet.setFrozenRows(1);
    }

    const flagSuspeito = verificarFraude(sheet, dados);
    const id = sheet.getLastRow(); // cabeçalho = linha 1, primeiro dado = linha 2 → id=1

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

    // Formatar linha nova
    const novaLinha = sheet.getLastRow();
    if (flagSuspeito) {
      sheet.getRange(novaLinha, 10).setBackground('#fef9c3'); // amarelo para suspeitos
    }

    return resposta({ status: 'ok', id: id });

  } catch (err) {
    return resposta({ status: 'erro', mensagem: err.message });
  }
}

// ==============================================================
// doGet — health check (para testar se o script está no ar)
// ==============================================================
function doGet(e) {
  return ContentService
    .createTextOutput('Multiexpo QR Code API — OK')
    .setMimeType(ContentService.MimeType.TEXT);
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
