# Ferry Ops — sistema de gestão do Mercado João Ferry 2026

Aplicação web instalável (Android e desktop) para cadastro de gestores, alunos e projetos,
monitoramento ao vivo de atividades, desempenho e ranking, check-in de visitantes por QR
e pesquisa de satisfação.

## Arquivos

```
index.html   estrutura da página, tema claro/escuro, todo o CSS
qr.js        gerador de QR próprio (modo byte, nível M, versões 1–10) — sem dependências
store.js     camada de dados, pontuação de desempenho, alertas e exportação CSV
app.js       telas, roteador por hash e ações
```

Sem framework, sem etapa de compilação, sem servidor próprio. Abrir `index.html`
por um servidor estático já faz o sistema funcionar.

## Dois modos de armazenamento

| Modo | Quando | Comportamento |
|---|---|---|
| **nuvem** | publicado como artefato no Claude | banco compartilhado, ao vivo entre dispositivos |
| **local** | qualquer outra hospedagem | `localStorage` do próprio navegador, funciona offline |

O código das telas não conhece o modo: tudo passa por `Store.all/add/upd/del`.
Para trocar o armazenamento por outro backend, reescreva apenas `store.js`.

## Modelo de dados

- `config/geral` — nome do evento, semana atual, espaços do passaporte
- `pessoas` — nome, papel (direção, gestor, aluno, professor), projeto, contato
- `projetos` — código, nome, cor, gestor responsável, descrição
- `tarefas` — título, projeto, responsável, prazo em semana, critério de aceite, situação
- `presencas` — pessoa, data, presente
- `atividades` — registro cronológico que alimenta o monitoramento
- `visitantes` / `selos` — código anônimo do passaporte e check-ins por espaço
- `satisfacao` — nota de 1 a 5 e comentário, sem identificação
- `incidentes` — registro de falhas durante ensaios e no dia

## Pontuação de desempenho

```
score = 40 × (concluídas no prazo / total)
      + 25 × (concluídas / total)
      + 20 × (presença média da equipe)
      + 15 × (1 − bloqueadas / total)
```

Sem registro de presença, o componente entra neutro (0,75) em vez de zerar a frente.
As semanas são em contagem regressiva: concluir em S-8 com prazo S-6 é adiantado.

## QR Codes

`qr.js` gera os códigos no próprio dispositivo. A leitura usa a API `BarcodeDetector`
do navegador (disponível no Chrome para Android) e sempre aceita digitação manual como
alternativa — nenhuma operação depende da câmera.

## Pontos de extensão para a equipe

Marcados como trabalho dos alunos, na ordem de dificuldade:

1. **EcoTracker** — nova coleção `eco` com itens e quilos desviados do descarte,
   somada no painel público. É um CRUD simples sobre o padrão já existente.
2. **Agendamento da zona XR** — 24 janelas de 15 minutos com 4 vagas cada;
   reaproveita `visitantes` e a mesma tela de posto.
3. **Registro de incidentes** — a coleção já existe e alimenta os alertas;
   falta a tela de cadastro.
4. **Catálogo da Galeria** — obras com ficha e QR próprio.
5. **Escala de turnos** — titular e substituto por posto, a partir de `pessoas`.
