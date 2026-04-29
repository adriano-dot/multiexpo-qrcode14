// ==============================================================
// CONFIGURAÇÃO — cole a URL do Apps Script após publicar
// ==============================================================
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbySFxlQNdfEkqZEOZ9zvlxSabwZLZCAwRgcWMfpAJQcEERlCJM6hSYz6vjaNN1aayxC/exec';

// ==============================================================
// Init
// ==============================================================
document.addEventListener('DOMContentLoaded', () => {
  preencherEstandes();
  preencherAvaliacoes();
  configurarCNPJ();
  configurarTipos();
  configurarFormulario();
  monitorarConexao();
  processarFila();
});

// ==============================================================
// Estandes 1–200
// ==============================================================
function preencherEstandes() {
  const select = document.getElementById('estande');
  for (let i = 1; i <= 200; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = `Estande ${i}`;
    select.appendChild(opt);
  }
}

// ==============================================================
// Botões de avaliação 0–10
// ==============================================================
function preencherAvaliacoes() {
  const group = document.getElementById('rating-group');
  for (let i = 0; i <= 10; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn-rating';
    btn.textContent = i;
    btn.dataset.val = i;
    btn.addEventListener('click', () => selecionarAvaliacao(i));
    group.appendChild(btn);
  }
}

function selecionarAvaliacao(valor) {
  document.querySelectorAll('.btn-rating').forEach(b => b.classList.remove('selected'));
  document.querySelector(`.btn-rating[data-val="${valor}"]`).classList.add('selected');
  document.getElementById('avaliacao').value = valor;
  document.getElementById('avaliacao-error').textContent = '';
}

// ==============================================================
// Tipo de transação
// ==============================================================
function configurarTipos() {
  document.querySelectorAll('.btn-tipo').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-tipo').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      document.getElementById('tipo_transacao').value = btn.dataset.value;
      document.getElementById('tipo-error').textContent = '';
    });
  });
}

// ==============================================================
// CNPJ — máscara e validação
// ==============================================================
function configurarCNPJ() {
  const input = document.getElementById('cnpj');
  input.addEventListener('input', () => {
    input.value = aplicarMascaraCNPJ(input.value);
    const cnpjLimpo = input.value.replace(/\D/g, '');
    if (cnpjLimpo.length === 14) validarCNPJInput(input);
    else {
      input.className = '';
      document.getElementById('cnpj-error').textContent = '';
    }
  });
  input.addEventListener('blur', () => validarCNPJInput(input));
}

function aplicarMascaraCNPJ(v) {
  v = v.replace(/\D/g, '').slice(0, 14);
  if (v.length > 12) return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (v.length > 8)  return v.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
  if (v.length > 5)  return v.replace(/^(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
  if (v.length > 2)  return v.replace(/^(\d{2})(\d{0,3})/, '$1.$2');
  return v;
}

function validarCNPJ(cnpj) {
  cnpj = cnpj.replace(/\D/g, '');
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1+$/.test(cnpj)) return false;

  const calcDigito = (cnpj, tamanho) => {
    let soma = 0, pos = tamanho - 7;
    for (let i = tamanho; i >= 1; i--) {
      soma += parseInt(cnpj[tamanho - i]) * pos--;
      if (pos < 2) pos = 9;
    }
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return (
    calcDigito(cnpj, 12) === parseInt(cnpj[12]) &&
    calcDigito(cnpj, 13) === parseInt(cnpj[13])
  );
}

function validarCNPJInput(input) {
  const errorEl = document.getElementById('cnpj-error');
  const cnpjLimpo = input.value.replace(/\D/g, '');
  if (cnpjLimpo.length < 14) {
    input.className = '';
    errorEl.textContent = '';
    return false;
  }
  if (!validarCNPJ(cnpjLimpo)) {
    input.classList.remove('valid');
    input.classList.add('invalid');
    errorEl.textContent = 'CNPJ inválido. Verifique os números.';
    return false;
  }
  input.classList.remove('invalid');
  input.classList.add('valid');
  errorEl.textContent = '';
  return true;
}

// ==============================================================
// Antifraude — verificação local (localStorage)
// ==============================================================
const STORAGE_REGISTROS = 'multiexpo_registros';
const DEZ_MINUTOS = 10 * 60 * 1000;
const VINTE_QUATRO_HORAS = 24 * 60 * 60 * 1000;

function verificarRegistroRecente(estande, cnpj) {
  const registros = lerRegistrosLocais();
  const agora = Date.now();
  return registros.some(
    r => r.cnpj === cnpj && String(r.estande) === String(estande) &&
         agora - r.timestamp < DEZ_MINUTOS
  );
}

function salvarRegistroLocal(estande, cnpj) {
  const registros = lerRegistrosLocais();
  registros.push({ cnpj, estande: String(estande), timestamp: Date.now() });
  const filtrados = registros.filter(r => Date.now() - r.timestamp < VINTE_QUATRO_HORAS);
  localStorage.setItem(STORAGE_REGISTROS, JSON.stringify(filtrados));
}

function lerRegistrosLocais() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_REGISTROS) || '[]');
  } catch { return []; }
}

// ==============================================================
// Fila offline — reenvio automático
// ==============================================================
const STORAGE_FILA = 'multiexpo_fila';

function adicionarNaFila(dados) {
  const fila = lerFila();
  fila.push({ dados, tentativas: 0, criadoEm: Date.now() });
  localStorage.setItem(STORAGE_FILA, JSON.stringify(fila));
}

function lerFila() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_FILA) || '[]');
  } catch { return []; }
}

async function processarFila() {
  const fila = lerFila();
  if (fila.length === 0) return;

  const novaFila = [];
  for (const item of fila) {
    if (item.tentativas >= 20) continue; // descartar após 20 tentativas
    const ok = await enviarParaWebhook(item.dados);
    if (!ok) novaFila.push({ ...item, tentativas: item.tentativas + 1 });
  }
  localStorage.setItem(STORAGE_FILA, JSON.stringify(novaFila));
}

// ==============================================================
// Envio para webhook (Apps Script)
// ==============================================================
async function enviarParaWebhook(dados) {
  if (!WEBHOOK_URL || WEBHOOK_URL.includes('COLE_A_URL')) return false;
  try {
    const params = new URLSearchParams({
      estande:    dados.numero_estande,
      cnpj:       dados.cnpj,
      cnpj_fmt:   dados.cnpj_formatado,
      valor:      dados.valor_aproximado,
      tipo:       dados.tipo_transacao,
      avaliacao:  dados.avaliacao_atendimento,
      ip:         dados.ip_address,
      data_hora:  dados.data_hora,
      timestamp:  dados.timestamp_iso
    });
    await fetch(`${WEBHOOK_URL}?${params.toString()}`, {
      method: 'GET',
      mode: 'no-cors'
    });
    return true;
  } catch {
    return false;
  }
}

async function obterIP() {
  try {
    const res = await fetch('https://api.ipify.org?format=json', { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return data.ip;
  } catch {
    return 'desconhecido';
  }
}

// ==============================================================
// Monitorar conexão
// ==============================================================
function monitorarConexao() {
  let badge = document.createElement('div');
  badge.className = 'offline-badge';
  badge.textContent = 'Sem conexão — registro será enviado quando reconectar';
  document.body.appendChild(badge);

  const atualizar = () => {
    badge.classList.toggle('visible', !navigator.onLine);
    if (navigator.onLine) processarFila();
  };

  window.addEventListener('online', atualizar);
  window.addEventListener('offline', atualizar);
  atualizar();
}

// ==============================================================
// Submit do formulário
// ==============================================================
function configurarFormulario() {
  document.getElementById('form-registro').addEventListener('submit', async (e) => {
    e.preventDefault();

    const estande = document.getElementById('estande').value;
    const cnpjInput = document.getElementById('cnpj');
    const valorInput = document.getElementById('valor');
    const tipo = document.getElementById('tipo_transacao').value;
    const avaliacao = document.getElementById('avaliacao').value;

    let valido = true;

    if (!estande) {
      document.getElementById('estande-error').textContent = 'Selecione o estande.';
      valido = false;
    } else {
      document.getElementById('estande-error').textContent = '';
    }

    if (!validarCNPJInput(cnpjInput)) {
      if (!cnpjInput.value) document.getElementById('cnpj-error').textContent = 'Informe o CNPJ.';
      valido = false;
    }

    const valor = parseFloat(valorInput.value);
    if (!valorInput.value || isNaN(valor) || valor <= 0) {
      document.getElementById('valor-error').textContent = 'Informe um valor maior que zero.';
      valido = false;
    } else {
      document.getElementById('valor-error').textContent = '';
    }

    if (!tipo) {
      document.getElementById('tipo-error').textContent = 'Selecione o tipo de transação.';
      valido = false;
    }

    if (avaliacao === '') {
      document.getElementById('avaliacao-error').textContent = 'Selecione uma avaliação de 0 a 10.';
      valido = false;
    }

    if (!valido) return;

    const cnpjLimpo = cnpjInput.value.replace(/\D/g, '');

    // Antifraude: mesmo CNPJ + estande em menos de 10 min
    const warningBox = document.getElementById('form-warning');
    if (verificarRegistroRecente(estande, cnpjLimpo)) {
      warningBox.style.display = 'block';
      warningBox.textContent =
        '⚠️ Você já registrou este estande recentemente. O registro será salvo, mas pode ser revisado pelo administrador.';
    } else {
      warningBox.style.display = 'none';
    }

    const btn = document.getElementById('btn-submit');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    const ip = await obterIP();

    const dados = {
      numero_estande: estande,
      cnpj: cnpjLimpo,
      cnpj_formatado: cnpjInput.value,
      valor_aproximado: valor,
      tipo_transacao: tipo,
      avaliacao_atendimento: parseInt(avaliacao),
      ip_address: ip,
      data_hora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
      timestamp_iso: new Date().toISOString()
    };

    // Salvar no localStorage (antifraude local)
    salvarRegistroLocal(estande, cnpjLimpo);

    // Tentar enviar; se falhar, vai para fila
    const ok = await enviarParaWebhook(dados);
    if (!ok) adicionarNaFila(dados);

    // Mostrar sucesso independente do envio (dados estão salvos na fila)
    document.getElementById('form-registro').style.display = 'none';
    document.getElementById('success-screen').style.display = 'block';

    btn.disabled = false;
    btn.textContent = 'Registrar';
  });
}

// ==============================================================
// Reset do formulário
// ==============================================================
function resetForm() {
  const form = document.getElementById('form-registro');
  form.reset();
  form.style.display = 'block';
  document.getElementById('success-screen').style.display = 'none';
  document.getElementById('form-warning').style.display = 'none';

  document.querySelectorAll('.btn-tipo').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.btn-rating').forEach(b => b.classList.remove('selected'));
  document.getElementById('tipo_transacao').value = '';
  document.getElementById('avaliacao').value = '';
  document.querySelectorAll('.field-error').forEach(el => el.textContent = '');
  document.getElementById('cnpj').className = '';

  processarFila(); // tenta reenviar pendentes
}
