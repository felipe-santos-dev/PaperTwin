# Lista base do simulador · PaperTwin (MP1)

Fonte principal: `pesquisa-B-manual-processo.md`. Conferência: `pesquisa-A-varredura.md`.
Arquivos que acompanham esta lista:
- `catalogo-base.csv` — 75 linhas — 68 TAGs próprias + 7 padrões por cilindro (parte seca, QCS, Pope, utilidades + o mínimo do preparo/prensas que move o simulador)
- `relacoes-fopdt.csv` — as 15 relações (23 linhas com os desdobramentos b/c) causa-efeito da pesquisa B como modelos de 1ª ordem com tempo morto, já com as TAGs deste catálogo

## Decisões
1. **Base: pesquisa B.** Contas fecham (produção, balanço de água no Speed Sizer) e as relações já vêm com ganho, tempo morto e τ.
2. **Conflitos resolvidos:**
   | Variável | Adotado |
   |---|---|
   | Vapor G1 (aquecimento) | −30 a +60 kPa rel, alvo 15 |
   | Vapor grupo principal (G4) | 120–350 kPa rel, alvo 230 |
   | Vapor pós-secagem | 40–250 kPa rel, alvo 120–140 |
   | Umidade final | alvo 4,8 % (lab 4,3–5,3) |
   | Umidade antes da colagem | alvo 5,2 % |
   | Calandra | 110 kN/m · rolo térmico 120 °C |
   | Speed Sizer | sólidos 9,5 % · nip 50 kN/m · 1,8 g/m² por lado |
   | Pope | nip 3,2 kN/m · tração da folha 330 N/m (separados) |
   | Espessura | alvo 102 µm |
   | Produção | 45 t/h (8 m × 1.250 m/min × 75 g/m²) |
3. **Esquema de TAGs** (fictícias, ISA-5.1), numeração por área:
   - 1xx preparo · 2xx caixa · 3xx formação · 4xx prensas
   - 5xx pré-secagem: 51x vapor por grupo, 52x ΔP sifões, 53x nível de condensado, 505–508 capota e telas
   - 6xx Speed Sizer · 7xx pós-secagem (71x vapor, 72x ΔP) · 8xx calandra · 9xx QCS · 10xx Pope · 11xx utilidades
   - Por cilindro (nn = 01–36): `VI-51nnA/B` vibração LA/LC, `VE-51nnA/B` envelope LA/LC, `TI-52nn` superfície, `TI-53nnA/B` temperatura do mancal
   - Grupos de vapor: G1 CS1–6 · G2 CS7–12 · G3 CS13–18 · G4 CS19–26 (pré) · G5 CS27–32 · G6 CS33–36 (pós). **Esta divisão e o número de cilindros (13 + 5 pares) são suposição do protótipo, não vêm da pesquisa B** — continuam `assumed` até conferir na MP1.
   - Laboratório: tags `LAB-12xx` da seção 12.2 da pesquisa B ficam numa lista própria (sem malha, sem compressão). `LAB-1206R` = razão de tração MD/CD (derivada de LAB-1206).
   - Mudanças em relação à pesquisa B: PIC-501/502 viraram PIC-511…514 (um por grupo); tração da Pope é `WIC-1002` (a pesquisa usa TIC, mas T é temperatura).
4. **Origem de cada valor** na coluna `fonte`: `B`, `ISO 20816-3` ou `assumed`. Os `assumed` (G2/G3, temperatura de mancal, envelope, superfície) precisam de conferência na MP1.
5. **Histórico estilo PI:** `exc_dev` e `comp_dev` no catálogo são o ponto de partida da compressão (filtro de exceção + swinging door). Ajustar depois de medir a taxa de compressão.

## Entidades de operação (além das TAGs)
- **Turno**: letra, início, fim, operador responsável, produção, eficiência, passagem (pendências).
- **Bobina jumbo**: número, início, fim, peso, comprimento, diâmetro final, gramatura/umidade/espessura médias, 2σ CD, emendas, destino (aprovada / rebaixada / segregada) e motivo.
- **Quebra de folha**: início, fim, posição na máquina, causa provável, sinais nos 10 min anteriores.
- **Troca de gramatura**: de/para, início, estabilização, bobinas afetadas.
- **Ronda**: horário, executante, pontos, por ponto: temperatura de campo, ruído, vazamento, observação, valor online no momento.
- **Nota de manutenção**: número (simulado), equipamento, sintoma, prioridade 1–4, origem (alarme / ronda / operação), situação, se exige parada, evidências anexadas.
- **Alteração de setpoint**: malha, valor anterior e novo, quem, quando, motivo.
- **Alarme** (ISA-18.2): TAG, limite, prioridade, ativo / reconhecido / normalizado, horários.
