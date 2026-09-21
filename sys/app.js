/* app.js — interface do Ferry Ops. Router por hash, renderização declarativa. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = $('#app'), tabsEl = $('#tabs'), stEl = $('#st'), dlg = $('#dlg');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hora(iso) { return iso ? String(iso).slice(11, 16) : '--:--'; }
  function dataHora(iso) {
    if (!iso) return '';
    var d = String(iso);
    return d.slice(8, 10) + '/' + d.slice(5, 7) + ' ' + d.slice(11, 16);
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function semanaLabel(n) { return n == null ? '—' : 'S-' + n; }

  var ABAS = [
    ['painel', 'Painel'], ['projetos', 'Projetos'], ['tarefas', 'Tarefas'],
    ['pessoas', 'Pessoas'], ['presenca', 'Presença'], ['desempenho', 'Desempenho'],
    ['visitantes', 'Visitantes'], ['satisfacao', 'Satisfação'],
    ['qr', 'QR Codes'], ['publico', 'Painel público'], ['dados', 'Dados']
  ];

  function rota() {
    var h = (location.hash || '#/painel').replace(/^#\/?/, '');
    var p = h.split('/');
    return { view: p[0] || 'painel', arg: decodeURIComponent(p[1] || '') };
  }

  function renderTabs() {
    var v = rota().view;
    tabsEl.innerHTML = ABAS.map(function (a) {
      return '<a href="#/' + a[0] + '"' + (a[0] === v ? ' class="sel"' : '') + '>' + esc(a[1]) + '</a>';
    }).join('');
  }

  // ---------------- diálogo ----------------
  var dlgOnOk = null;
  function abrirDialogo(titulo, corpoHtml, onOk, okTexto) {
    dlg.innerHTML =
      '<form method="dialog"><div class="dh"><h3>' + esc(titulo) + '</h3>' +
      '<button class="btn sm" value="cancel" type="submit">Fechar</button></div>' +
      '<div class="db">' + corpoHtml + '</div>' +
      (onOk ? '<div class="df"><button class="btn" value="cancel" type="submit">Cancelar</button>' +
        '<button class="btn pri" id="dlgOk" type="button">' + esc(okTexto || 'Salvar') + '</button></div>' : '') +
      '</form>';
    dlgOnOk = onOk;
    if (onOk) {
      $('#dlgOk', dlg).onclick = function () {
        var r = dlgOnOk(dlg);
        if (r !== false) dlg.close();
      };
    }
    dlg.showModal();
  }
  function campo(nome, rotulo, valor, tipo) {
    return '<label class="f"><span>' + esc(rotulo) + '</span><input type="' + (tipo || 'text') +
      '" name="' + nome + '" value="' + esc(valor == null ? '' : valor) + '"></label>';
  }
  function area(nome, rotulo, valor) {
    return '<label class="f"><span>' + esc(rotulo) + '</span><textarea name="' + nome + '">' +
      esc(valor || '') + '</textarea></label>';
  }
  function selecao(nome, rotulo, opcoes, valor) {
    return '<label class="f"><span>' + esc(rotulo) + '</span><select name="' + nome + '">' +
      opcoes.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (String(o[0]) === String(valor) ? ' selected' : '') +
          '>' + esc(o[1]) + '</option>';
      }).join('') + '</select></label>';
  }
  function val(d, nome) { var e = d.querySelector('[name=' + nome + ']'); return e ? e.value.trim() : ''; }

  function semanasOpts() {
    var o = [['', 'sem prazo']];
    for (var i = 10; i >= 0; i--) o.push([i, 'S-' + i]);
    return o;
  }
  function projetosOpts(vazio) {
    var o = vazio ? [['', vazio]] : [];
    return o.concat(Store.all('projetos').map(function (p) { return [p.id, p.codigo + ' · ' + p.nome]; }));
  }
  function pessoasOpts(vazio, filtro) {
    var o = vazio ? [['', vazio]] : [];
    return o.concat(Store.all('pessoas').filter(filtro || function () { return true; })
      .map(function (p) { return [p.id, p.nome]; }));
  }
  function nomePessoa(id) { var p = Store.get('pessoas', id); return p ? p.nome : '—'; }
  function projetoDe(id) { return Store.get('projetos', id); }
  function tagProjeto(p) {
    if (!p) return '<span class="muted">sem projeto</span>';
    return '<span class="tag" style="background:' + esc(p.cor || '#14614a') + '">' + esc(p.codigo) + '</span>';
  }

  // ---------------- views ----------------
  var V = {};

  V.painel = function () {
    var cfg = Store.cfg();
    var ts = Store.all('tarefas');
    var porStatus = {};
    Store.STATUS.forEach(function (s) { porStatus[s] = ts.filter(function (t) { return t.status === s; }).length; });
    var alertas = Store.alertas();
    var vis = Store.resumoVisitantes();
    var sat = Store.resumoSatisfacao();
    var rank = Store.ranking();
    var feed = Store.all('atividades').slice().sort(function (a, b) {
      return String(b.em || '').localeCompare(String(a.em || ''));
    }).slice(0, 12);

    var conclPct = ts.length ? Math.round(porStatus.concluida / ts.length * 100) : 0;

    return '<div class="head"><div><h2>Painel de monitoramento</h2>' +
      '<p>' + esc(cfg.evento) + ' · semana atual <b>' + semanaLabel(cfg.semanaAtual) + '</b>. ' +
      'Tudo nesta tela é derivado de registros; nada é estimado.</p></div>' +
      '<div class="sp"><button class="btn" data-ac="cfg">Configurar</button>' +
      '<a class="btn" href="#/publico">Abrir painel público</a></div></div>' +

      '<div class="grid g3">' +
      kpi('Tarefas concluídas', porStatus.concluida + '/' + ts.length, conclPct + '% do total', conclPct >= 70 ? 'good' : '') +
      kpi('Em andamento', porStatus.andamento, 'sendo executadas agora') +
      kpi('Bloqueadas', porStatus.bloqueada, porStatus.bloqueada ? 'exigem decisão sua' : 'nenhuma trava', porStatus.bloqueada ? 'alert' : '') +
      kpi('Alertas abertos', alertas.length, alertas.length ? 'ver lista abaixo' : 'nada pendente', alertas.length ? 'warn' : 'good') +
      kpi('Visitantes registrados', vis.visitantes, vis.completos + ' com passaporte completo') +
      kpi('Satisfação', sat.media == null ? '—' : sat.media.toFixed(1), sat.n + ' resposta(s)') +
      '</div>' +

      (alertas.length ? '<div class="sec"><h3>Alertas <em>o que exige decisão agora</em></h3>' +
        '<div class="tw"><table><tbody>' + alertas.map(function (a) {
          return '<tr><td style="width:96px"><span class="pill ' +
            (a.nivel === 'crit' ? 'p-bloqueada' : 'p-revisao') + '">' +
            (a.nivel === 'crit' ? 'crítico' : 'atenção') + '</span></td><td>' + esc(a.texto) + '</td></tr>';
        }).join('') + '</tbody></table></div></div>' : '') +

      '<div class="sec"><h3>Projetos <em>estado e desempenho</em></h3>' +
      (rank.length ? '<div class="tw"><table><thead><tr><th>Projeto</th><th>Gestor</th><th>Equipe</th>' +
        '<th>Tarefas</th><th>Concluídas</th><th>Desempenho</th></tr></thead><tbody>' +
        rank.map(function (r) {
          var p = r.projeto;
          return '<tr><td>' + tagProjeto(p) + ' ' + esc(p.nome) + '</td>' +
            '<td>' + esc(p.gestorId ? nomePessoa(p.gestorId) : '—') + '</td>' +
            '<td class="num">' + Store.pessoasDo(p.id).length + '</td>' +
            '<td class="num">' + r.total + '</td>' +
            '<td class="num">' + r.concl + '</td>' +
            '<td style="min-width:150px">' + barra(r.score) + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="empty">Nenhum projeto cadastrado. Comece em <a href="#/projetos">Projetos</a>.</div>') +
      '</div>' +

      '<div class="sec"><h3>Atividade recente <em>atualiza ao vivo</em></h3>' +
      (feed.length ? '<div class="card"><div class="feed">' + feed.map(function (f) {
        return '<div class="fe"><time>' + esc(dataHora(f.em)) + '</time><div>' + esc(f.texto) + '</div></div>';
      }).join('') + '</div></div>' : '<div class="empty">Sem atividade registrada ainda.</div>') +
      '</div>';
  };

  function kpi(k, v, s, cls) {
    return '<div class="kpi ' + (cls || '') + '"><div class="k">' + esc(k) + '</div>' +
      '<div class="v">' + esc(v) + '</div><div class="s">' + esc(s || '') + '</div></div>';
  }
  function barra(score) {
    if (score == null) return '<span class="muted">sem dados</span>';
    return '<div style="display:flex;align-items:center;gap:9px">' +
      '<div class="bar" style="flex:1"><i style="width:' + score + '%"></i></div>' +
      '<b class="num" style="font-family:var(--mono);font-size:13px">' + score + '</b></div>';
  }

  V.projetos = function () {
    var ps = Store.all('projetos');
    return '<div class="head"><div><h2>Projetos</h2>' +
      '<p>Cada projeto tem um gestor responsável e uma equipe. Projeto sem gestor ou sem equipe gera alerta no painel.</p></div>' +
      '<div class="sp"><button class="btn pri" data-ac="novoProjeto">Novo projeto</button></div></div>' +
      (ps.length ? '<div class="grid g2">' + ps.map(function (p) {
        var d = Store.desempenho(p.id), eq = Store.pessoasDo(p.id);
        return '<div class="card"><div style="display:flex;align-items:baseline;gap:10px;margin-bottom:8px">' +
          tagProjeto(p) + '<h3 style="font-size:17px;font-weight:600;margin-right:auto">' + esc(p.nome) + '</h3>' +
          '<button class="btn sm" data-ac="editProjeto" data-id="' + p.id + '">Editar</button></div>' +
          (p.descricao ? '<p style="color:var(--ink-2);font-size:14px;margin-bottom:10px">' + esc(p.descricao) + '</p>' : '') +
          '<div style="font-family:var(--mono);font-size:11.5px;color:var(--ink-3);margin-bottom:9px">' +
          'Gestor: <b style="color:var(--ink-2)">' + esc(p.gestorId ? nomePessoa(p.gestorId) : 'não definido') + '</b> · ' +
          'Equipe: <b style="color:var(--ink-2)">' + eq.length + '</b> · Tarefas: <b style="color:var(--ink-2)">' + d.total + '</b></div>' +
          barra(d.score) + '</div>';
      }).join('') + '</div>'
        : '<div class="empty">Nenhum projeto ainda. Crie o primeiro para começar a distribuir tarefas.</div>');
  };

  V.pessoas = function () {
    var ps = Store.all('pessoas');
    return '<div class="head"><div><h2>Pessoas</h2>' +
      '<p>Organizadores, gestores de projeto, professores e alunos. Cada aluno deve estar em um projeto e ter tarefa em aberto.</p></div>' +
      '<div class="sp"><button class="btn pri" data-ac="novaPessoa">Nova pessoa</button></div></div>' +
      (ps.length ? '<div class="tw"><table><thead><tr><th>Nome</th><th>Papel</th><th>Projeto</th>' +
        '<th>Tarefas</th><th>Presença</th><th>Contato</th><th></th></tr></thead><tbody>' +
        ps.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome); }).map(function (p) {
          var d = Store.desempenhoPessoa(p.id), pr = projetoDe(p.projetoId);
          return '<tr><td><b>' + esc(p.nome) + '</b></td>' +
            '<td>' + esc(Store.PAPEIS[p.papel] || p.papel) + '</td>' +
            '<td>' + (pr ? tagProjeto(pr) + ' ' + esc(pr.nome) : '<span class="muted">—</span>') + '</td>' +
            '<td class="num">' + d.concluidas + '/' + d.tarefas +
            (d.abertas === 0 && p.papel === 'aluno' ? ' <span class="pill p-revisao">sem tarefa</span>' : '') + '</td>' +
            '<td class="num">' + (d.taxaPresenca == null ? '—' : Math.round(d.taxaPresenca * 100) + '%') + '</td>' +
            '<td class="muted">' + esc(p.contato || '') + '</td>' +
            '<td><button class="btn sm" data-ac="editPessoa" data-id="' + p.id + '">Editar</button></td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="empty">Nenhuma pessoa cadastrada.</div>');
  };

  V.tarefas = function () {
    var f = sessionStorage.getItem('fTarefa') || '';
    var ts = Store.all('tarefas').filter(function (t) { return !f || t.projetoId === f; });
    var grupos = {};
    Store.STATUS.forEach(function (s) { grupos[s] = ts.filter(function (t) { return t.status === s; }); });

    return '<div class="head"><div><h2>Tarefas</h2>' +
      '<p>Toda tarefa tem responsável nomeado, prazo em semana e critério de aceite verificável.</p></div>' +
      '<div class="sp">' +
      '<select id="fTarefa" style="width:auto">' + projetosOpts('todos os projetos').map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (o[0] === f ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select>' +
      '<button class="btn pri" data-ac="novaTarefa">Nova tarefa</button></div></div>' +
      (ts.length ? Store.STATUS.map(function (s) {
        if (!grupos[s].length) return '';
        return '<div class="sec"><h3><span class="pill p-' + s + '">' + esc(Store.STATUS_ROTULO[s]) + '</span>' +
          '<em>' + grupos[s].length + '</em></h3><div class="tw"><table><tbody>' +
          grupos[s].map(function (t) {
            var pr = projetoDe(t.projetoId);
            return '<tr><td style="width:66px">' + tagProjeto(pr) + '</td>' +
              '<td><b>' + esc(t.titulo) + '</b>' +
              (t.criterio ? '<div class="muted" style="font-size:12.5px">' + esc(t.criterio) + '</div>' : '') + '</td>' +
              '<td style="width:130px">' + esc(t.responsavelId ? nomePessoa(t.responsavelId) : '—') + '</td>' +
              '<td class="num" style="width:62px">' + esc(semanaLabel(t.prazoSemana === '' ? null : t.prazoSemana)) + '</td>' +
              '<td style="width:210px"><select data-ac="statusTarefa" data-id="' + t.id + '" style="width:auto">' +
              Store.STATUS.map(function (s2) {
                return '<option value="' + s2 + '"' + (s2 === t.status ? ' selected' : '') + '>' +
                  esc(Store.STATUS_ROTULO[s2]) + '</option>';
              }).join('') + '</select> ' +
              '<button class="btn sm" data-ac="editTarefa" data-id="' + t.id + '">Editar</button></td></tr>';
          }).join('') + '</tbody></table></div></div>';
      }).join('')
        : '<div class="empty">Nenhuma tarefa. Crie a primeira e nomeie o responsável.</div>');
  };

  V.presenca = function () {
    var hoje = new Date().toISOString().slice(0, 10);
    var alunos = Store.all('pessoas').filter(function (p) { return p.papel === 'aluno' || p.papel === 'gestor'; });
    var doDia = Store.all('presencas').filter(function (x) { return x.data === hoje; });
    var mapa = {};
    doDia.forEach(function (x) { mapa[x.pessoaId] = x; });

    return '<div class="head"><div><h2>Presença</h2>' +
      '<p>Registro por encontro. Alimenta o componente de presença do desempenho e expõe evasão silenciosa cedo.</p></div></div>' +
      '<div class="card" style="margin-bottom:16px"><label class="f" style="margin:0"><span>Data do encontro</span>' +
      '<input type="date" id="dataPres" value="' + hoje + '" style="max-width:220px"></label></div>' +
      (alunos.length ? '<div class="tw"><table><thead><tr><th>Pessoa</th><th>Projeto</th><th>Presença</th></tr></thead><tbody>' +
        alunos.map(function (p) {
          var r = mapa[p.id], pr = projetoDe(p.projetoId);
          return '<tr><td><b>' + esc(p.nome) + '</b></td>' +
            '<td>' + (pr ? tagProjeto(pr) + ' ' + esc(pr.nome) : '<span class="muted">—</span>') + '</td>' +
            '<td><button class="btn sm' + (r && r.presente ? ' pri' : '') + '" data-ac="pres" data-id="' + p.id + '" data-v="1">presente</button> ' +
            '<button class="btn sm' + (r && !r.presente ? ' danger' : '') + '" data-ac="pres" data-id="' + p.id + '" data-v="0">ausente</button>' +
            (r ? ' <span class="muted" style="font-size:12px">registrado</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="empty">Cadastre alunos em <a href="#/pessoas">Pessoas</a> para registrar presença.</div>');
  };

  V.desempenho = function () {
    var rank = Store.ranking().filter(function (r) { return r.total > 0; });
    var pessoas = Store.all('pessoas').filter(function (p) { return p.papel === 'aluno' || p.papel === 'gestor'; })
      .map(function (p) { return Object.assign({ p: p }, Store.desempenhoPessoa(p.id)); })
      .sort(function (a, b) { return b.concluidas - a.concluidas; });

    var destaques = [];
    if (rank.length) {
      var maisPrazo = rank.slice().sort(function (a, b) {
        return (b.total ? b.noPrazo / b.total : 0) - (a.total ? a.noPrazo / a.total : 0);
      })[0];
      var menosBloq = rank.slice().sort(function (a, b) { return a.bloq - b.bloq; })[0];
      var maisEntrega = rank.slice().sort(function (a, b) { return b.concl - a.concl; })[0];
      destaques = [
        ['Mais entregas no prazo', maisPrazo.projeto, maisPrazo.total ? Math.round(maisPrazo.noPrazo / maisPrazo.total * 100) + '%' : '—'],
        ['Mais entregas concluídas', maisEntrega.projeto, maisEntrega.concl + ' tarefas'],
        ['Menos travas', menosBloq.projeto, menosBloq.bloq + ' bloqueada(s)']
      ];
    }

    return '<div class="head"><div><h2>Desempenho e ranking</h2>' +
      '<p>Pontuação de 0 a 100: 40 pontos de entregas no prazo, 25 de conclusão, 20 de presença da equipe e 15 de ausência de travas.</p></div></div>' +

      '<div class="card" style="margin-bottom:18px;border-left:4px solid var(--warn);background:var(--warn-soft)">' +
      '<b>Leia o ranking com cuidado.</b> Frentes de naturezas diferentes não competem no mesmo eixo: ' +
      'uma frente de recepção e logística não gera o mesmo volume de tarefas que uma de desenvolvimento. ' +
      'Use a pontuação para conversar com o líder, e os destaques por categoria para reconhecer publicamente.</div>' +

      (destaques.length ? '<div class="grid g3" style="margin-bottom:20px">' + destaques.map(function (d) {
        return '<div class="kpi"><div class="k">' + esc(d[0]) + '</div>' +
          '<div class="v" style="font-size:20px;margin-top:8px">' + esc(d[1].nome) + '</div>' +
          '<div class="s">' + esc(d[2]) + '</div></div>';
      }).join('') + '</div>' : '') +

      '<div class="sec"><h3>Por projeto</h3>' +
      (rank.length ? '<div class="tw"><table><thead><tr><th>#</th><th>Projeto</th><th>Pontuação</th>' +
        '<th>No prazo</th><th>Concluídas</th><th>Bloqueadas</th><th>Presença</th></tr></thead><tbody>' +
        rank.map(function (r, i) {
          return '<tr><td class="num">' + (i + 1) + '</td>' +
            '<td>' + tagProjeto(r.projeto) + ' ' + esc(r.projeto.nome) + '</td>' +
            '<td style="min-width:150px">' + barra(r.score) + '</td>' +
            '<td class="num">' + r.noPrazo + '/' + r.total + '</td>' +
            '<td class="num">' + r.concl + '</td>' +
            '<td class="num">' + r.bloq + '</td>' +
            '<td class="num">' + (r.presenca == null ? '<span class="muted">sem registro</span>' : Math.round(r.presenca * 100) + '%') + '</td></tr>';
        }).join('') + '</tbody></table></div>'
        : '<div class="empty">Sem tarefas registradas — a pontuação aparece quando houver o que medir.</div>') + '</div>' +

      '<div class="sec"><h3>Por pessoa</h3>' +
      (pessoas.length ? '<div class="tw"><table><thead><tr><th>Pessoa</th><th>Projeto</th>' +
        '<th>Concluídas</th><th>Em aberto</th><th>Presença</th></tr></thead><tbody>' +
        pessoas.map(function (x) {
          var pr = projetoDe(x.p.projetoId);
          return '<tr><td><b>' + esc(x.p.nome) + '</b></td>' +
            '<td>' + (pr ? tagProjeto(pr) + ' ' + esc(pr.nome) : '<span class="muted">—</span>') + '</td>' +
            '<td class="num">' + x.concluidas + '</td><td class="num">' + x.abertas + '</td>' +
            '<td class="num">' + (x.taxaPresenca == null ? '—' : Math.round(x.taxaPresenca * 100) + '%') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">Sem pessoas cadastradas.</div>') + '</div>';
  };

  // ---------------- visitantes ----------------
  var scanState = { ativo: false, stream: null, timer: null };

  V.visitantes = function () {
    var esp = Store.espacos();
    var atual = sessionStorage.getItem('espacoPosto') || esp[0];
    var r = Store.resumoVisitantes();
    var ultimos = Store.all('selos').slice().sort(function (a, b) {
      return String(b.em || '').localeCompare(String(a.em || ''));
    }).slice(0, 10);

    return '<div class="head"><div><h2>Posto de check-in</h2>' +
      '<p>O operador registra o passaporte do visitante. O visitante não instala nada — carrega apenas o cartão impresso.</p></div></div>' +

      '<div class="grid g2">' +
      '<div class="card"><label class="f"><span>Espaço deste posto</span>' +
      '<select id="espacoPosto">' + esp.map(function (e) {
        return '<option value="' + esc(e) + '"' + (e === atual ? ' selected' : '') + '>' + esc(e) + '</option>';
      }).join('') + '</select></label>' +
      '<label class="f"><span>Código do passaporte</span>' +
      '<input type="text" id="codVis" placeholder="V0001" autocomplete="off" inputmode="text"></label>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn pri" data-ac="registrarSelo">Registrar selo</button>' +
      '<button class="btn" data-ac="scan">Escanear com a câmera</button>' +
      '<button class="btn" data-ac="novoVisitante">Gerar novo código</button></div>' +
      '<div id="scanWrap" style="margin-top:14px"></div>' +
      '<div id="ultimoSelo" style="margin-top:12px"></div></div>' +

      '<div class="card"><h3 style="font-size:16px;font-weight:600;margin-bottom:12px">Fluxo do evento</h3>' +
      '<div class="grid g3" style="gap:10px">' +
      kpi('Visitantes', r.visitantes, 'com ao menos um selo') +
      kpi('Selos', r.selos, 'registros totais') +
      kpi('Passaportes completos', r.completos, 'todos os espaços') +
      '</div>' +
      '<div style="margin-top:14px">' + esp.map(function (e) {
        var n = r.porEspaco[e] || 0;
        var max = Math.max.apply(null, esp.map(function (x) { return r.porEspaco[x] || 0; }).concat([1]));
        return '<div style="margin-bottom:9px"><div style="display:flex;font-size:13px;margin-bottom:3px">' +
          '<span style="margin-right:auto">' + esc(e) + '</span><b class="num">' + n + '</b></div>' +
          '<div class="bar"><i style="width:' + Math.round(n / max * 100) + '%"></i></div></div>';
      }).join('') + '</div></div></div>' +

      '<div class="sec"><h3>Últimos registros</h3>' +
      (ultimos.length ? '<div class="tw"><table><tbody>' + ultimos.map(function (s) {
        return '<tr><td style="width:78px" class="num muted">' + esc(hora(s.em)) + '</td>' +
          '<td style="width:96px"><b class="num">' + esc(s.codigo) + '</b></td>' +
          '<td>' + esc(s.espaco) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">Nenhum selo registrado ainda.</div>') + '</div>';
  };

  async function iniciarScan() {
    var wrap = $('#scanWrap');
    if (scanState.ativo) { pararScan(); return; }
    if (!('BarcodeDetector' in window)) {
      wrap.innerHTML = '<div class="empty">Este navegador não lê QR pela câmera. ' +
        'Digite o código do passaporte no campo acima — a operação não depende da câmera.</div>';
      return;
    }
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      wrap.innerHTML = '<video class="scan" id="vid" playsinline muted autoplay></video>' +
        '<p class="muted" style="text-align:center;font-size:12.5px;margin-top:8px">Aponte para o QR do passaporte</p>';
      var v = $('#vid'); v.srcObject = stream; scanState.stream = stream; scanState.ativo = true;
      var det = new window.BarcodeDetector({ formats: ['qr_code'] });
      scanState.timer = setInterval(async function () {
        try {
          var cods = await det.detect(v);
          if (cods && cods.length) {
            var txt = String(cods[0].rawValue || '').trim();
            var m = txt.match(/([A-Za-z]\d{3,})\s*$/);
            $('#codVis').value = (m ? m[1] : txt).toUpperCase();
            pararScan();
            registrarSelo();
          }
        } catch (e) { /* quadro sem código */ }
      }, 420);
    } catch (e) {
      wrap.innerHTML = '<div class="empty">Câmera indisponível ou permissão negada. Digite o código manualmente.</div>';
    }
  }
  function pararScan() {
    if (scanState.timer) clearInterval(scanState.timer);
    if (scanState.stream) scanState.stream.getTracks().forEach(function (t) { t.stop(); });
    scanState = { ativo: false, stream: null, timer: null };
    var w = $('#scanWrap'); if (w) w.innerHTML = '';
  }

  async function registrarSelo() {
    var cod = ($('#codVis') && $('#codVis').value || '').trim().toUpperCase();
    var esp = sessionStorage.getItem('espacoPosto') || Store.espacos()[0];
    var r = await Store.registrarSelo(cod, esp);
    toast(r.msg);
    if (r.ok) {
      await Store.log('selo', 'Selo de ' + esp + ' registrado para ' + cod);
      var el = $('#ultimoSelo');
      if (el) el.innerHTML = '<div class="card" style="background:var(--ok-soft);border-color:var(--ok)">' +
        '<b>' + esc(cod) + '</b> — ' + r.selos + ' de ' + Store.espacos().length + ' selos</div>';
      if ($('#codVis')) $('#codVis').value = '';
    }
  }

  V.satisfacao = function () {
    var r = Store.resumoSatisfacao();
    var max = Math.max.apply(null, r.dist.concat([1]));
    return '<div class="head"><div><h2>Satisfação</h2>' +
      '<p>Questionário curto, anônimo, sem nenhum dado pessoal. O mesmo formulário serve ao QR da saída.</p></div></div>' +
      '<div class="grid g2">' +
      '<div class="card"><h3 style="font-size:16px;font-weight:600;margin-bottom:12px">Responder agora</h3>' +
      '<label class="f"><span>Nota geral do evento</span></label>' +
      '<div class="stars" id="notas">' + [1, 2, 3, 4, 5].map(function (n) {
        return '<button type="button" data-ac="nota" data-v="' + n + '" aria-pressed="false">' + n + '</button>';
      }).join('') + '</div>' +
      '<label class="f" style="margin-top:14px"><span>O que mais gostou? (opcional)</span>' +
      '<textarea id="comentario" maxlength="400"></textarea></label>' +
      '<button class="btn pri" data-ac="enviarSat">Enviar resposta</button></div>' +

      '<div class="card"><h3 style="font-size:16px;font-weight:600;margin-bottom:12px">Resultados</h3>' +
      '<div class="grid g3" style="gap:10px;margin-bottom:14px">' +
      kpi('Respostas', r.n, '') +
      kpi('Nota média', r.media == null ? '—' : r.media.toFixed(1), 'de 1 a 5', r.media >= 4 ? 'good' : '') +
      '</div>' +
      [5, 4, 3, 2, 1].map(function (n) {
        var q = r.dist[n - 1];
        return '<div style="margin-bottom:8px"><div style="display:flex;font-size:13px;margin-bottom:3px">' +
          '<span style="margin-right:auto">nota ' + n + '</span><b class="num">' + q + '</b></div>' +
          '<div class="bar"><i style="width:' + Math.round(q / max * 100) + '%"></i></div></div>';
      }).join('') + '</div></div>' +

      '<div class="sec"><h3>Comentários</h3>' +
      (Store.all('satisfacao').filter(function (s) { return s.comentario; }).length
        ? '<div class="card"><div class="feed">' + Store.all('satisfacao').filter(function (s) { return s.comentario; })
          .slice(-20).reverse().map(function (s) {
            return '<div class="fe"><time>' + esc(hora(s.em)) + '</time><div>' +
              '<span class="pill p-concluida">' + esc(s.nota) + '</span> ' + esc(s.comentario) + '</div></div>';
          }).join('') + '</div></div>'
        : '<div class="empty">Nenhum comentário ainda.</div>') + '</div>';
  };

  V.qr = function () {
    var esp = Store.espacos();
    var base = location.href.split('#')[0];
    var vis = Store.all('visitantes').slice(-24);
    var temQR = typeof QR !== 'undefined';

    return '<div class="head"><div><h2>QR Codes</h2>' +
      '<p>Gerados no próprio dispositivo, sem serviço externo. Imprima, plastifique e teste uma amostra sob sol direto antes da produção em volume.</p></div>' +
      '<div class="sp"><button class="btn" data-ac="imprimir">Imprimir esta página</button>' +
      '<button class="btn pri" data-ac="gerarLote">Gerar lote de passaportes</button></div></div>' +

      (!temQR ? '<div class="empty">Gerador de QR não carregou nesta visualização.</div>' :
        '<div class="sec"><h3>Pesquisa de satisfação <em>fixar na saída</em></h3>' +
        '<div class="qrgrid">' + qcard(base + '#/satisfacao', 'Satisfação', 'saída do evento') + '</div></div>' +

        '<div class="sec"><h3>Postos de check-in <em>um por espaço, para o operador abrir</em></h3>' +
        '<div class="qrgrid">' + esp.map(function (e) {
          return qcard(base + '#/visitantes/' + encodeURIComponent(e), e, 'posto do operador');
        }).join('') + '</div></div>' +

        '<div class="sec"><h3>Passaportes de visitante <em>' + vis.length + ' de ' + Store.all('visitantes').length + ' exibidos</em></h3>' +
        (vis.length ? '<div class="qrgrid">' + vis.map(function (v) {
          return qcard(v.codigo, v.codigo, 'passaporte');
        }).join('') + '</div>'
          : '<div class="empty">Nenhum passaporte gerado. Use “Gerar lote de passaportes”.</div>') + '</div>');
  };

  function qcard(conteudo, titulo, legenda) {
    var svg = '';
    try { svg = QR.qrSvg(conteudo); } catch (e) { svg = '<div class="muted">conteúdo longo demais</div>'; }
    return '<div class="qcard"><div class="qrbox">' + svg + '</div>' +
      '<div class="cd">' + esc(titulo) + '</div><div class="lb">' + esc(legenda) + '</div></div>';
  }

  V.publico = function () {
    var r = Store.resumoVisitantes(), s = Store.resumoSatisfacao(), cfg = Store.cfg();
    var esp = Store.espacos();
    var max = Math.max.apply(null, esp.map(function (e) { return r.porEspaco[e] || 0; }).concat([1]));
    document.body.style.background = 'var(--ink)';
    return '<div class="pub"><h1>' + esc(cfg.evento) + '</h1>' +
      '<p style="opacity:.7;margin-top:6px">Painel ao vivo · atualiza sozinho</p>' +
      '<div class="pg">' +
      '<div class="pc"><div class="k">Visitantes</div><div class="v">' + r.visitantes + '</div></div>' +
      '<div class="pc"><div class="k">Selos registrados</div><div class="v">' + r.selos + '</div></div>' +
      '<div class="pc"><div class="k">Passaportes completos</div><div class="v">' + r.completos + '</div></div>' +
      '<div class="pc"><div class="k">Satisfação</div><div class="v">' + (s.media == null ? '—' : s.media.toFixed(1)) + '</div></div>' +
      '</div>' +
      '<div style="margin-top:30px">' + esp.map(function (e) {
        var n = r.porEspaco[e] || 0;
        return '<div style="margin-bottom:14px"><div style="display:flex;font-size:16px;margin-bottom:5px">' +
          '<span style="margin-right:auto">' + esc(e) + '</span><b>' + n + '</b></div>' +
          '<div style="height:10px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden">' +
          '<i style="display:block;height:100%;width:' + Math.round(n / max * 100) + '%;background:#5cc79e"></i></div></div>';
      }).join('') + '</div>' +
      '<p style="margin-top:26px;opacity:.55;font-size:13px"><a href="#/painel" style="color:inherit">voltar ao painel de gestão</a></p></div>';
  };

  V.dados = function () {
    var cols = ['pessoas', 'projetos', 'tarefas', 'presencas', 'visitantes', 'selos', 'satisfacao', 'atividades', 'incidentes'];
    return '<div class="head"><div><h2>Dados</h2>' +
      '<p>Exportação para o relatório final e para a avaliação. Formato CSV com ponto e vírgula, que o Excel brasileiro abre direto.</p></div></div>' +
      '<div class="tw"><table><thead><tr><th>Conjunto</th><th>Registros</th><th></th></tr></thead><tbody>' +
      cols.map(function (c) {
        return '<tr><td><b>' + esc(c) + '</b></td><td class="num">' + Store.all(c).length + '</td>' +
          '<td><button class="btn sm" data-ac="csv" data-col="' + c + '">Exportar CSV</button></td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="sec"><h3>Manutenção</h3><div class="card">' +
      '<p style="margin-bottom:12px;color:var(--ink-2)">Modo de armazenamento: <b>' +
      (Store.modo === 'nuvem' ? 'nuvem compartilhada — todos os dispositivos veem o mesmo dado, ao vivo'
        : 'local neste navegador — os dados não saem deste dispositivo') + '</b></p>' +
      '<button class="btn danger" data-ac="limpar">Apagar todos os dados</button></div></div>' +
      '<div class="sec"><h3>Privacidade</h3><div class="card" style="border-left:4px solid var(--warn);background:var(--warn-soft)">' +
      'O passaporte do visitante usa apenas um código sequencial anônimo. Não registre nome, telefone, CPF ou foto de visitante ' +
      'neste sistema. Defina e cumpra um prazo de descarte — o plano prevê trinta dias após a entrega do relatório final.</div></div>';
  };

  // ---------------- ações ----------------
  var AC = {
    cfg: function () {
      var c = Store.cfg();
      abrirDialogo('Configuração', campo('evento', 'Nome do evento', c.evento) +
        selecao('semanaAtual', 'Semana atual', semanasOpts().slice(1), c.semanaAtual) +
        area('espacos', 'Espaços do passaporte (um por linha)', c.espacos.join('\n')),
        function (d) {
          var esp = d.querySelector('[name=espacos]').value.split('\n')
            .map(function (s) { return s.trim(); }).filter(Boolean);
          Store.salvarCfg({
            evento: val(d, 'evento') || c.evento,
            semanaAtual: Number(val(d, 'semanaAtual')),
            espacos: esp.length ? esp : c.espacos
          }).then(render);
        });
    },
    novoProjeto: function () { formProjeto(null); },
    editProjeto: function (el) { formProjeto(Store.get('projetos', el.dataset.id)); },
    novaPessoa: function () { formPessoa(null); },
    editPessoa: function (el) { formPessoa(Store.get('pessoas', el.dataset.id)); },
    novaTarefa: function () { formTarefa(null); },
    editTarefa: function (el) { formTarefa(Store.get('tarefas', el.dataset.id)); },

    pres: async function (el) {
      var data = ($('#dataPres') && $('#dataPres').value) || new Date().toISOString().slice(0, 10);
      var pid = el.dataset.id, presente = el.dataset.v === '1';
      var ex = Store.all('presencas').find(function (x) { return x.pessoaId === pid && x.data === data; });
      if (ex) await Store.upd('presencas', ex.id, { presente: presente });
      else await Store.add('presencas', { pessoaId: pid, data: data, presente: presente, em: Store.agora() });
      render();
    },

    registrarSelo: function () { registrarSelo(); },
    scan: function () { iniciarScan(); },
    novoVisitante: async function () {
      var cod = Store.novoCodigoVisitante();
      await Store.add('visitantes', { codigo: cod });
      if ($('#codVis')) $('#codVis').value = cod;
      toast('Código ' + cod + ' criado');
    },
    gerarLote: function () {
      abrirDialogo('Gerar lote de passaportes',
        campo('qtd', 'Quantos códigos gerar', '40', 'number') +
        '<p class="muted" style="font-size:13px">Códigos sequenciais anônimos. Imprima, plastifique e distribua na entrada.</p>',
        function (d) {
          var n = Math.max(1, Math.min(200, Number(val(d, 'qtd')) || 0));
          (async function () {
            for (var i = 0; i < n; i++) {
              await Store.add('visitantes', { codigo: Store.novoCodigoVisitante() });
            }
            toast(n + ' passaportes gerados');
            render();
          })();
        }, 'Gerar');
    },
    imprimir: function () { window.print(); },

    nota: function (el) {
      [].forEach.call(document.querySelectorAll('#notas button'), function (b) {
        b.setAttribute('aria-pressed', b === el ? 'true' : 'false');
      });
    },
    enviarSat: async function () {
      var sel = document.querySelector('#notas button[aria-pressed=true]');
      if (!sel) { toast('Escolha uma nota de 1 a 5'); return; }
      await Store.add('satisfacao', {
        nota: Number(sel.dataset.v),
        comentario: ($('#comentario') && $('#comentario').value.trim()) || '',
        em: Store.agora()
      });
      toast('Obrigado pela resposta');
      render();
    },

    csv: async function (el) {
      var col = el.dataset.col, txt = Store.csv(col);
      if (!txt) { toast('Nada a exportar em ' + col); return; }
      var r = await Store.baixar('ferryops-' + col + '.csv', txt);
      if (r === 'salvo') toast('Arquivo ' + col + '.csv salvo');
      else abrirDialogo('CSV de ' + col,
        '<p class="muted" style="margin-bottom:10px">Download não disponível nesta visualização. Copie o conteúdo abaixo.</p>' +
        '<textarea style="min-height:240px;font-family:var(--mono);font-size:12px">' + esc(txt) + '</textarea>');
    },
    limpar: function () {
      abrirDialogo('Apagar todos os dados',
        '<p>Esta ação remove pessoas, projetos, tarefas, presenças, visitantes, selos e respostas. Não há desfazer.</p>',
        function () { Store.limpar().then(function () { toast('Dados apagados'); render(); }); }, 'Apagar tudo');
    },

    statusTarefa: null // tratado no change
  };

  function formProjeto(p) {
    var cores = [['#14614a', 'verde'], ['#3b4c8a', 'azul'], ['#8d6206', 'âmbar'], ['#9b4a2f', 'terracota'], ['#5c3d78', 'roxo']];
    abrirDialogo(p ? 'Editar projeto' : 'Novo projeto',
      '<div class="row">' + campo('codigo', 'Código curto', p ? p.codigo : '') +
      selecao('cor', 'Cor', cores, p ? p.cor : '#14614a') + '</div>' +
      campo('nome', 'Nome do projeto', p ? p.nome : '') +
      area('descricao', 'Descrição', p ? p.descricao : '') +
      selecao('gestorId', 'Gestor responsável', pessoasOpts('não definido'), p ? p.gestorId : ''),
      function (d) {
        var dados = {
          codigo: val(d, 'codigo') || 'P', nome: val(d, 'nome'),
          descricao: val(d, 'descricao'), cor: val(d, 'cor'), gestorId: val(d, 'gestorId')
        };
        if (!dados.nome) { toast('Dê um nome ao projeto'); return false; }
        (p ? Store.upd('projetos', p.id, dados) : Store.add('projetos', dados))
          .then(function () { Store.log('projeto', (p ? 'Projeto atualizado: ' : 'Projeto criado: ') + dados.nome); render(); });
      });
  }

  function formPessoa(p) {
    var papeis = Object.keys(Store.PAPEIS).map(function (k) { return [k, Store.PAPEIS[k]]; });
    abrirDialogo(p ? 'Editar pessoa' : 'Nova pessoa',
      campo('nome', 'Nome completo', p ? p.nome : '') +
      '<div class="row">' + selecao('papel', 'Papel', papeis, p ? p.papel : 'aluno') +
      selecao('projetoId', 'Projeto', projetosOpts('sem projeto'), p ? p.projetoId : '') + '</div>' +
      campo('contato', 'Contato (telefone ou e-mail)', p ? p.contato : ''),
      function (d) {
        var dados = {
          nome: val(d, 'nome'), papel: val(d, 'papel'),
          projetoId: val(d, 'projetoId'), contato: val(d, 'contato')
        };
        if (!dados.nome) { toast('Informe o nome'); return false; }
        (p ? Store.upd('pessoas', p.id, dados) : Store.add('pessoas', dados))
          .then(function () { Store.log('pessoa', (p ? 'Cadastro atualizado: ' : 'Pessoa cadastrada: ') + dados.nome); render(); });
      });
  }

  function formTarefa(t) {
    abrirDialogo(t ? 'Editar tarefa' : 'Nova tarefa',
      campo('titulo', 'Título da tarefa', t ? t.titulo : '') +
      '<div class="row">' +
      selecao('projetoId', 'Projeto', projetosOpts('sem projeto'), t ? t.projetoId : (sessionStorage.getItem('fTarefa') || '')) +
      selecao('responsavelId', 'Responsável', pessoasOpts('sem responsável'), t ? t.responsavelId : '') + '</div>' +
      '<div class="row">' +
      selecao('prazoSemana', 'Prazo (semana)', semanasOpts(), t ? t.prazoSemana : '') +
      selecao('status', 'Situação', Store.STATUS.map(function (s) { return [s, Store.STATUS_ROTULO[s]]; }), t ? t.status : 'pendente') +
      '</div>' +
      area('criterio', 'Critério de aceite — o que prova que está pronta', t ? t.criterio : ''),
      function (d) {
        var dados = {
          titulo: val(d, 'titulo'), projetoId: val(d, 'projetoId'),
          responsavelId: val(d, 'responsavelId'), criterio: val(d, 'criterio'),
          prazoSemana: val(d, 'prazoSemana') === '' ? null : Number(val(d, 'prazoSemana')),
          status: val(d, 'status')
        };
        if (!dados.titulo) { toast('Dê um título à tarefa'); return false; }
        if (dados.status === 'concluida') {
          dados.concluidaEm = (t && t.concluidaEm) || Store.agora();
          dados.semanaConcluida = (t && t.semanaConcluida != null) ? t.semanaConcluida : Store.cfg().semanaAtual;
        }
        (t ? Store.upd('tarefas', t.id, dados) : Store.add('tarefas', dados))
          .then(function () { Store.log('tarefa', (t ? 'Tarefa atualizada: ' : 'Tarefa criada: ') + dados.titulo); render(); });
      });
  }

  // ---------------- eventos ----------------
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-ac]');
    if (!el || el.tagName === 'SELECT') return;
    var fn = AC[el.dataset.ac];
    if (fn) { e.preventDefault(); fn(el); }
  });

  document.addEventListener('change', async function (e) {
    var el = e.target;
    if (el.id === 'fTarefa') { sessionStorage.setItem('fTarefa', el.value); render(); }
    if (el.id === 'espacoPosto') { sessionStorage.setItem('espacoPosto', el.value); }
    if (el.dataset && el.dataset.ac === 'statusTarefa') {
      var t = Store.get('tarefas', el.dataset.id);
      var patch = { status: el.value };
      if (el.value === 'concluida') {
        patch.concluidaEm = Store.agora();
        patch.semanaConcluida = Store.cfg().semanaAtual;
      }
      await Store.upd('tarefas', el.dataset.id, patch);
      await Store.log('tarefa', 'Tarefa "' + (t ? t.titulo : '') + '" agora está ' + Store.STATUS_ROTULO[el.value]);
      render();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'codVis') { e.preventDefault(); registrarSelo(); }
  });

  window.addEventListener('hashchange', function () { pararScan(); render(); });

  // ---------------- render ----------------
  function render() {
    var r = rota();
    if (r.view !== 'publico') document.body.style.background = '';
    document.querySelector('nav.tabs').hidden = (r.view === 'publico');
    document.querySelector('.top').hidden = (r.view === 'publico');
    renderTabs();

    if (r.view === 'visitantes' && r.arg) sessionStorage.setItem('espacoPosto', r.arg);

    var fn = V[r.view] || V.painel;
    try {
      app.innerHTML = fn();
    } catch (err) {
      console.error(err);
      app.innerHTML = '<div class="empty">Erro ao desenhar esta tela: ' + esc(err.message) + '</div>';
    }

    stEl.textContent = Store.modo === 'nuvem' ? 'nuvem · ao vivo' : 'local neste dispositivo';
    stEl.className = 'status ' + (Store.modo === 'nuvem' ? 'on' : 'local');
    $('#ctx').textContent = Store.cfg().evento;
  }

  Store.onChange(render);
  render();
  Store.init().then(function () { render(); });
})();
