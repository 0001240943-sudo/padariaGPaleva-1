// ===== THERMOFIRE - Lógica completa =====
const DB = {
  load(key, def = []) {
    try { return JSON.parse(localStorage.getItem(key)) || def; }
    catch { return def; }
  },
  save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
};

const App = {
  temp: 25,
  damper: 100,
  fornada: null,
  produtos: DB.load('tf_produtos', [
    { id: 1, nome: 'Pão francês', cat: 'Pães', min: 200, max: 230, tempo: 18 },
    { id: 2, nome: 'Pão integral', cat: 'Pães', min: 190, max: 220, tempo: 25 },
    { id: 3, nome: 'Bolo de cenoura', cat: 'Bolos', min: 160, max: 180, tempo: 40 }
  ]),
  historico: DB.load('tf_historico', []),
  usuarios: DB.load('tf_usuarios', []),

  init() {
    this.bindForms();
    this.renderProdutos();
    this.renderHistorico();
    this.popularSelect();
    if (this.fornada) this.startSimulacao();
  },

  // ===== AUTENTICAÇÃO =====
  login(email, senha) {
    const u = this.usuarios.find(x => x.email === email && x.senha === senha);
    if (u) { DB.save('tf_user', u); location.href = 'index.html'; }
    else alert('E-mail ou senha incorretos');
  },

  cadastro(nome, email, senha) {
    if (this.usuarios.find(x => x.email === email)) return alert('E-mail já cadastrado');
    if (senha.length < 10) return alert('Senha deve ter 10+ caracteres');
    const user = { id: Date.now(), nome, email, senha, role: this.usuarios.length ? 'operador' : 'admin' };
    this.usuarios.push(user);
    DB.save('tf_usuarios', this.usuarios);
    DB.save('tf_user', user);
    location.href = 'index.html';
  },

  logout() {
    localStorage.removeItem('tf_user');
    location.href = 'login.html';
  },

  // ===== PRODUTOS =====
  addProduto(p) {
    p.id = Date.now();
    this.produtos.push(p);
    DB.save('tf_produtos', this.produtos);
    this.renderProdutos();
    this.popularSelect();
  },

  editProduto(id, dados) {
    const i = this.produtos.findIndex(p => p.id === id);
    if (i >= 0) { this.produtos[i] = { ...this.produtos[i], ...dados }; DB.save('tf_produtos', this.produtos); this.renderProdutos(); }
  },

  delProduto(id) {
    if (!confirm('Excluir produto?')) return;
    this.produtos = this.produtos.filter(p => p.id !== id);
    DB.save('tf_produtos', this.produtos);
    this.renderProdutos();
  },

  renderProdutos() {
    const el = document.getElementById('produtos-lista');
    if (!el) return;
    const imagens = {
      'Pão francês': 'assets/pão francês.jpg',
      'Pão integral': 'assets/pão integral.jpg',
      'Bolo de cenoura': 'assets/bolo de cenoura.jpg'
    };
    el.innerHTML = this.produtos.map(p => `
      <div class="product-card">
        ${imagens[p.nome] ? `<img src="${imagens[p.nome]}" alt="${p.nome}">` : ''}
        <div class="product-card-body">
          <h4>${p.nome}</h4>
          <div class="cat">${p.cat}</div>
          <div class="specs"><span>🌡 ${p.min}–${p.max}°C</span><span>⏱ ${p.tempo} min</span></div>
          <div class="product-actions">
            <button class="edit" onclick="App.abrirEdit(${p.id})">✏️</button>
            <button class="del" onclick="App.delProduto(${p.id})">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');
  },

  popularSelect() {
    const sel = document.getElementById('sel-produto');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione...</option>' +
      this.produtos.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');
  },

  abrirEdit(id) {
    const p = this.produtos.find(x => x.id === id);
    if (!p) return;
    document.getElementById('edit-id').value = p.id;
    document.getElementById('edit-nome').value = p.nome;
    document.getElementById('edit-cat').value = p.cat;
    document.getElementById('edit-min').value = p.min;
    document.getElementById('edit-max').value = p.max;
    document.getElementById('edit-tempo').value = p.tempo;
    document.getElementById('modal-edit').classList.add('show');
  },

  // ===== FORNADA =====
  iniciarFornada(id) {
    const p = this.produtos.find(x => x.id === +id);
    if (!p) return;
    this.fornada = {
      id: Date.now(),
      produto: p.nome,
      min: p.min, max: p.max, tempo: p.tempo,
      inicio: Date.now(),
      logs: [],
      damperLog: []
    };
    this.startSimulacao();
    this.updateUI();
  },

  finalizarFornada(qualidade, obs) {
    if (!this.fornada) return;
    this.fornada.fim = Date.now();
    this.fornada.qualidade = qualidade;
    this.fornada.obs = obs;
    this.fornada.tempFinal = this.temp;
    this.historico.push(this.fornada);
    DB.save('tf_historico', this.historico);
    this.fornada = null;
    this.renderHistorico();
    this.exportJSON();
    this.updateUI();
    document.getElementById('modal-fim').classList.remove('show');
  },

  // ===== SIMULAÇÃO SENSOR =====
  startSimulacao() {
    if (this._sim) clearInterval(this._sim);
    this._sim = setInterval(() => this.tick(), 2000);
  },

  tick() {
    if (!this.fornada) return;
    const alvo = (this.fornada.min + this.fornada.max) / 2;
    const diff = alvo - this.temp;
    this.temp += diff * 0.15 + (Math.random() - 0.5) * 6;
    this.temp = Math.max(20, Math.min(300, this.temp));

    // Damper: abre se frio, fecha se quente (mín 20%)
    if (diff > 10) { this.damper = Math.min(100, this.damper + 15); this.logDamper('abrir'); }
    else if (diff < -10) { this.damper = Math.max(20, this.damper - 15); this.logDamper('fechar'); }

    this.fornada.logs.push({ t: Date.now(), temp: this.temp, damper: this.damper });
    this.updateUI();
    this.checkAlerta();
  },

  logDamper(acao) {
    const hora = new Date().toLocaleTimeString('pt-BR');
    this.fornada.damperLog.push({ acao, hora, pos: this.damper });
    DB.save('tf_fornada_atual', this.fornada);
  },

  checkAlerta() {
    const { min, max } = this.fornada;
    const led = document.getElementById('led');
    const txt = document.getElementById('status-txt');
    if (!led) return;

    led.className = 'led';
    if (this.temp < min - 20 || this.temp > max + 20) {
      led.classList.add('vermelho'); txt.textContent = 'AÇÃO IMEDIATA!';
      this.buzz();
    } else if (this.temp < min || this.temp > max) {
      led.classList.add('amarelo'); txt.textContent = 'Atenção: fora da faixa';
    } else {
      led.classList.add('verde'); txt.textContent = 'Dentro da faixa ideal';
    }
  },

  buzz() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      o.connect(ctx.destination);
      o.frequency.value = 800;
      o.start(); o.stop(ctx.currentTime + 0.3);
    } catch {}
  },

  updateUI() {
    const t = document.getElementById('cur-temp');
    if (t) t.textContent = Math.round(this.temp) + '°C';

    const d = document.getElementById('damper-val');
    const df = document.getElementById('damper-fill');
    if (d) d.textContent = this.damper + '%';
    if (df) df.style.width = this.damper + '%';

    const bt = document.getElementById('baking-time');
    if (bt && this.fornada) {
      const s = Math.floor((Date.now() - this.fornada.inicio) / 1000);
      bt.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
    }

    const pn = document.getElementById('prod-name');
    if (pn) pn.textContent = this.fornada ? this.fornada.produto : 'Nenhuma fornada ativa';
  },

  renderHistorico() {
    const el = document.getElementById('hist-lista');
    if (!el) return;
    if (!this.historico.length) { el.innerHTML = '<p style="color:#6B4E3D;text-align:center;padding:2rem">Nenhuma fornada registrada</p>'; return; }
    el.innerHTML = this.historico.slice(-10).reverse().map(h => `
      <div class="alert-item ${h.qualidade === 'ótimo' ? 'ok' : h.qualidade === 'aceitável' ? 'warn' : 'err'}">
        <h4>${h.produto}</h4>
        <p>${new Date(h.inicio).toLocaleString('pt-BR')} · ${h.qualidade} · ${Math.round(h.tempFinal)}°C</p>
      </div>
    `).join('');
  },

  // ===== EXPORT JSON =====
  exportJSON() {
    const data = {
      exportado: new Date().toISOString(),
      produtos: this.produtos,
      historico: this.historico,
      fornadaAtual: this.fornada
    };
    DB.save('tf_backup', data);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `thermofire_${Date.now()}.json`;
    a.click();
  },

  // ===== BIND FORMS =====
  bindForms() {
    const $ = id => document.getElementById(id);

    // Login
    const lf = $('login-form');
    if (lf) lf.onsubmit = e => { e.preventDefault(); this.login($('login-email').value, $('login-senha').value); };

    // Cadastro
    const cf = $('cadastro-form');
    if (cf) cf.onsubmit = e => { e.preventDefault(); this.cadastro($('cad-nome').value, $('cad-email').value, $('cad-senha').value); };

    // Novo produto
    const pf = $('prod-form');
    if (pf) pf.onsubmit = e => {
      e.preventDefault();
      this.addProduto({
        nome: $('prod-nome').value,
        cat: $('prod-cat').value,
        min: +$('prod-min').value,
        max: +$('prod-max').value,
        tempo: +$('prod-tempo').value
      });
      $('modal-add').classList.remove('show');
      pf.reset();
    };

    // Edit produto
    const ef = $('edit-form');
    if (ef) ef.onsubmit = e => {
      e.preventDefault();
      this.editProduto(+$('edit-id').value, {
        nome: $('edit-nome').value,
        cat: $('edit-cat').value,
        min: +$('edit-min').value,
        max: +$('edit-max').value,
        tempo: +$('edit-tempo').value
      });
      $('modal-edit').classList.remove('show');
    };

    // Iniciar fornada
    const sel = $('sel-produto');
    if (sel) sel.onchange = e => { if (e.target.value) this.iniciarFornada(e.target.value); };

    // Finalizar fornada
    const ff = $('fim-form');
    if (ff) ff.onsubmit = e => {
      e.preventDefault();
      this.finalizarFornada($('fim-qual').value, $('fim-obs').value);
    };

    // Export
    const ex = $('btn-export');
    if (ex) ex.onclick = () => this.exportJSON();

    // Logout
    const lo = $('btn-logout');
    if (lo) lo.onclick = () => this.logout();

    // Fechar modais
    document.querySelectorAll('.modal-bg').forEach(m => {
      m.onclick = e => { if (e.target === m) m.classList.remove('show'); };
    });
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());