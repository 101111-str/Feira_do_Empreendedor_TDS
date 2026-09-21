/* store.js — camada de dados do Ferry Ops.
   Dois modos, mesma interface:
     • nuvem  — capacidade `db` do artefato, com atualização ao vivo entre dispositivos
     • local  — localStorage, quando a nuvem não está disponível nesta visualização
   Nenhuma tela conhece o modo: todas leem Store.all(col) e escrevem por Store.add/upd/del. */
(function (root) {
  'use strict';

  var COLS = ['config', 'pessoas', 'projetos', 'tarefas', 'atividades', 'presencas',
              'visitantes', 'selos', 'satisfacao', 'incidentes'];

  var Store = {
    modo: 'local',        // 'nuvem' | 'local'
    db: null,
    user: null,
    podeEscrever: true,
    cache: {},
    _subs: [],
    _listeners: [],
    pronto: false
  };

  COLS.forEach(function (c) { Store.cache[c] = []; });

  // ---------- utilidades ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function agora() { return new Date().toISOString(); }

  Store.uid = uid;
  Store.agora = agora;

  Store.onChange = function (fn) { Store._listeners.push(fn); };
  function emit() { Store._listeners.forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  Store.emit = emit;

  // ---------- local ----------
  var LKEY = 'ferryops.v1.';
  function lRead(col) {
    try { return JSON.parse(localStorage.getItem(LKEY + col) || '[]'); }
    catch (e) { return []; }
  }
  function lWrite(col, arr) {
    try { localStorage.setItem(LKEY + col, JSON.stringify(arr)); } catch (e) { /* cota */ }
  }

  // ---------- inicialização ----------
  Store.init = async function () {
    try {
      Store.user = await root.claude?.use?.('user');
    } catch (e) { Store.user = null; }

    var db = null;
    try { db = await root.claude?.use?.('db'); } catch (e) { db = null; }

    if (db) {
      Store.db = db;
      Store.modo = 'nuvem';
      try {
        var pode = Store.user ? await Store.user.can('data.write') : null;
        Store.podeEscrever = (pode === null || pode === undefined) ? true : !!pode;
      } catch (e) { Store.podeEscrever = true; }

      COLS.forEach(function (col) {
        var un = db.collection(col).onSnapshot(function (snap) {
          Store.cache[col] = snap.docs.map(function (d) {
            var o = d.data() || {};
            o.id = d.id;
            return o;
          });
          Store.pronto = true;
          emit();
        }, function (err) {
          console.warn('[db]', col, err && err.code);
          if (err && err.code === 'permission_denied') Store.podeEscrever = false;
        });
        Store._subs.push(un);
      });
      // garante primeira renderização mesmo com base vazia
      setTimeout(function () { Store.pronto = true; emit(); }, 1200);
    } else {
      Store.modo = 'local';
      COLS.forEach(function (col) { Store.cache[col] = lRead(col); });
      Store.pronto = true;
      emit();
    }
    return Store.modo;
  };

  // ---------- CRUD ----------
  Store.all = function (col) { return Store.cache[col] || []; };
  Store.get = function (col, id) {
    return (Store.cache[col] || []).find(function (x) { return x.id === id; }) || null;
  };

  Store.add = async function (col, dados) {
    var id = dados.id || uid();
    var doc = Object.assign({}, dados, { id: id, criadoEm: dados.criadoEm || agora() });
    if (Store.modo === 'nuvem') {
      var corpo = Object.assign({}, doc); delete corpo.id;
      await Store.db.doc(col + '/' + id).set(corpo);
    } else {
      var arr = Store.cache[col].slice(); arr.push(doc);
      Store.cache[col] = arr; lWrite(col, arr); emit();
    }
    return id;
  };

  Store.upd = async function (col, id, patch) {
    if (Store.modo === 'nuvem') {
      await Store.db.doc(col + '/' + id).update(patch);
    } else {
      var arr = Store.cache[col].map(function (x) {
        return x.id === id ? Object.assign({}, x, patch) : x;
      });
      Store.cache[col] = arr; lWrite(col, arr); emit();
    }
  };

  Store.del = async function (col, id) {
    if (Store.modo === 'nuvem') {
      await Store.db.doc(col + '/' + id).delete();
    } else {
      var arr = Store.cache[col].filter(function (x) { return x.id !== id; });
      Store.cache[col] = arr; lWrite(col, arr); emit();
    }
  };

  Store.limpar = async function () {
    for (var i = 0; i < COLS.length; i++) {
      var col = COLS[i], itens = Store.all(col).slice();
      for (var j = 0; j < itens.length; j++) await Store.del(col, itens[j].id);
    }
  };

  // registro de atividade — alimenta o monitoramento ao vivo
  Store.log = function (tipo, texto, extra) {
    return Store.add('atividades', Object.assign({ tipo: tipo, texto: texto, em: agora() }, extra || {}));
  };

  // ---------- domínio ----------
  var STATUS = ['pendente', 'andamento', 'revisao', 'concluida', 'bloqueada'];
  var STATUS_ROTULO = {
    pendente: 'pendente', andamento: 'em andamento', revisao: 'em revisão',
    concluida: 'concluída', bloqueada: 'bloqueada'
  };
  var PAPEIS = { diretor: 'Direção', gestor: 'Gestor de projeto', aluno: 'Aluno', professor: 'Professor' };
  Store.STATUS = STATUS;
  Store.STATUS_ROTULO = STATUS_ROTULO;
  Store.PAPEIS = PAPEIS;

  Store.tarefasDo = function (projetoId) {
    return Store.all('tarefas').filter(function (t) { return t.projetoId === projetoId; });
  };
  Store.pessoasDo = function (projetoId) {
    return Store.all('pessoas').filter(function (p) { return p.projetoId === projetoId; });
  };

  function pct(a, b) { return b > 0 ? a / b : 0; }

  /* Desempenho — quatro componentes, todos derivados de fatos registrados.
     Pontuação intencionalmente NÃO compara frentes de naturezas diferentes
     em valor absoluto: a tela mostra destaques por categoria junto do total. */
  Store.desempenho = function (projetoId) {
    var ts = Store.tarefasDo(projetoId);
    var total = ts.length;
    if (!total) return { total: 0, score: null, concl: 0, noPrazo: 0, bloq: 0, presenca: null };

    var concl = ts.filter(function (t) { return t.status === 'concluida'; });
    var noPrazo = concl.filter(function (t) {
      if (t.prazoSemana == null || t.semanaConcluida == null) return true;
      return Number(t.semanaConcluida) >= Number(t.prazoSemana); // semanas em contagem regressiva
    });
    var bloq = ts.filter(function (t) { return t.status === 'bloqueada'; });

    var membros = Store.pessoasDo(projetoId).map(function (p) { return p.id; });
    var pres = Store.all('presencas').filter(function (x) { return membros.indexOf(x.pessoaId) >= 0; });
    var presenca = pres.length ? pct(pres.filter(function (x) { return x.presente; }).length, pres.length) : null;

    var cNoPrazo = pct(noPrazo.length, total);
    var cConcl = pct(concl.length, total);
    var cPres = presenca == null ? 0.75 : presenca;   // sem registro: neutro
    var cBloq = 1 - pct(bloq.length, total);

    var score = Math.round(40 * cNoPrazo + 25 * cConcl + 20 * cPres + 15 * cBloq);
    return {
      total: total, score: Math.max(0, Math.min(100, score)),
      concl: concl.length, noPrazo: noPrazo.length, bloq: bloq.length,
      presenca: presenca, semDadosPresenca: presenca == null
    };
  };

  Store.ranking = function () {
    return Store.all('projetos').map(function (p) {
      return Object.assign({ projeto: p }, Store.desempenho(p.id));
    }).sort(function (a, b) { return (b.score ?? -1) - (a.score ?? -1); });
  };

  Store.desempenhoPessoa = function (pessoaId) {
    var ts = Store.all('tarefas').filter(function (t) { return t.responsavelId === pessoaId; });
    var concl = ts.filter(function (t) { return t.status === 'concluida'; }).length;
    var pres = Store.all('presencas').filter(function (x) { return x.pessoaId === pessoaId; });
    var presOk = pres.filter(function (x) { return x.presente; }).length;
    return {
      tarefas: ts.length, concluidas: concl,
      abertas: ts.filter(function (t) { return t.status !== 'concluida'; }).length,
      presencas: pres.length, presente: presOk,
      taxaPresenca: pres.length ? presOk / pres.length : null
    };
  };

  /* Alertas — o que exige decisão agora. Base do monitoramento. */
  Store.alertas = function () {
    var out = [];
    var ts = Store.all('tarefas');

    ts.filter(function (t) { return t.status === 'bloqueada'; }).forEach(function (t) {
      out.push({ nivel: 'crit', texto: 'Tarefa bloqueada: ' + t.titulo, projetoId: t.projetoId });
    });

    Store.all('projetos').forEach(function (p) {
      if (!Store.pessoasDo(p.id).length) {
        out.push({ nivel: 'warn', texto: 'Projeto sem equipe alocada: ' + p.nome, projetoId: p.id });
      }
      if (!p.gestorId) {
        out.push({ nivel: 'warn', texto: 'Projeto sem gestor responsável: ' + p.nome, projetoId: p.id });
      }
    });

    var semDono = ts.filter(function (t) { return !t.responsavelId && t.status !== 'concluida'; });
    if (semDono.length) {
      out.push({ nivel: 'warn', texto: semDono.length + ' tarefa(s) aberta(s) sem responsável nomeado' });
    }

    var semTarefa = Store.all('pessoas').filter(function (p) {
      if (p.papel !== 'aluno') return false;
      return !ts.some(function (t) { return t.responsavelId === p.id && t.status !== 'concluida'; });
    });
    if (semTarefa.length) {
      out.push({ nivel: 'warn', texto: semTarefa.length + ' aluno(s) sem nenhuma tarefa em aberto — risco de evasão silenciosa' });
    }

    Store.all('incidentes').filter(function (i) { return !i.resolvido; }).forEach(function (i) {
      out.push({ nivel: 'crit', texto: 'Incidente aberto: ' + (i.oque || 'sem descrição') });
    });

    return out;
  };

  // ---------- visitantes ----------
  // ---------- configuração ----------
  Store.cfg = function () {
    var c = Store.get('config', 'geral') || {};
    return {
      evento: c.evento || 'Mercado João Ferry 2026',
      semanaAtual: c.semanaAtual == null ? 10 : Number(c.semanaAtual),
      espacos: (c.espacos && c.espacos.length) ? c.espacos : Store.ESPACOS_PADRAO.slice()
    };
  };
  Store.salvarCfg = async function (patch) {
    var atual = Store.get('config', 'geral');
    var novo = Object.assign({}, Store.cfg(), patch);
    if (atual) await Store.upd('config', 'geral', novo);
    else await Store.add('config', Object.assign({ id: 'geral' }, novo));
  };

  Store.ESPACOS_PADRAO = ['Banco da Feira', 'Galeria de Arte', 'Escambo Literário', 'Feira Verde'];

  Store.espacos = function () {
    var base = Store.cfg().espacos.slice();
    Store.all('selos').forEach(function (s) {
      if (s.espaco && base.indexOf(s.espaco) < 0) base.push(s.espaco);
    });
    return base;
  };

  Store.novoCodigoVisitante = function () {
    var n = Store.all('visitantes').length + 1;
    return 'V' + String(n).padStart(4, '0');
  };

  Store.selosDe = function (codigo) {
    return Store.all('selos').filter(function (s) { return s.codigo === codigo; });
  };

  Store.registrarSelo = async function (codigo, espaco) {
    codigo = (codigo || '').trim().toUpperCase();
    if (!codigo) return { ok: false, msg: 'Código vazio' };
    var jaTem = Store.selosDe(codigo).some(function (s) { return s.espaco === espaco; });
    if (jaTem) return { ok: false, msg: codigo + ' já tem selo de ' + espaco };
    if (!Store.all('visitantes').some(function (v) { return v.codigo === codigo; })) {
      await Store.add('visitantes', { codigo: codigo });
    }
    await Store.add('selos', { codigo: codigo, espaco: espaco, em: agora() });
    return { ok: true, msg: 'Selo de ' + espaco + ' registrado para ' + codigo, selos: Store.selosDe(codigo).length };
  };

  Store.resumoVisitantes = function () {
    var selos = Store.all('selos');
    var porEspaco = {};
    selos.forEach(function (s) { porEspaco[s.espaco] = (porEspaco[s.espaco] || 0) + 1; });
    var porCodigo = {};
    selos.forEach(function (s) { (porCodigo[s.codigo] = porCodigo[s.codigo] || {})[s.espaco] = 1; });
    var esp = Store.espacos();
    var completos = Object.keys(porCodigo).filter(function (c) {
      return esp.every(function (e) { return porCodigo[c][e]; });
    }).length;
    var porHora = {};
    selos.forEach(function (s) {
      var h = (s.em || '').slice(11, 13);
      if (h) porHora[h] = (porHora[h] || 0) + 1;
    });
    return {
      visitantes: Object.keys(porCodigo).length,
      selos: selos.length,
      completos: completos,
      porEspaco: porEspaco,
      porHora: porHora
    };
  };

  Store.resumoSatisfacao = function () {
    var rs = Store.all('satisfacao');
    if (!rs.length) return { n: 0, media: null, dist: [0, 0, 0, 0, 0] };
    var soma = 0, dist = [0, 0, 0, 0, 0];
    rs.forEach(function (r) {
      var n = Number(r.nota) || 0;
      soma += n;
      if (n >= 1 && n <= 5) dist[n - 1]++;
    });
    return { n: rs.length, media: soma / rs.length, dist: dist };
  };

  // ---------- exportação ----------
  function csvEscape(v) {
    if (v == null) return '';
    var s = String(v);
    return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  Store.csv = function (col) {
    var itens = Store.all(col);
    if (!itens.length) return '';
    var cols = [];
    itens.forEach(function (it) {
      Object.keys(it).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); });
    });
    var linhas = [cols.join(';')];
    itens.forEach(function (it) {
      linhas.push(cols.map(function (c) { return csvEscape(it[c]); }).join(';'));
    });
    return linhas.join('\n');
  };

  Store.baixar = async function (nome, conteudo) {
    var dl = null;
    try { dl = await root.claude?.use?.('downloads'); } catch (e) { dl = null; }
    if (dl) {
      await dl.save({ filename: nome, data: conteudo });
      return 'salvo';
    }
    // sem a capacidade: abre o conteúdo para o usuário copiar
    return 'indisponivel';
  };

  root.Store = Store;
})(typeof self !== 'undefined' ? self : this);
