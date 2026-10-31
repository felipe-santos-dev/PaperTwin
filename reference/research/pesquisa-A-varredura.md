A seguir está a varredura técnica completa da máquina de papel de imprimir e escrever não revestido (cut-size, 70–90 g/m², ~1.200–1.300 m/min, largura útil ~8 m), organizada para alimentar o gêmeo digital. O documento segue a ordem do fluxo produtivo, com tabelas de variáveis, malhas de controle, alarmes e falhas por seção. Ao final, são entregues o catálogo CSV, as 15 relações causa-efeito para o simulador, o glossário PT-BR ↔ EN e as fontes públicas consultadas.

**Nota sobre confiança e fontes:** valores marcados como “alta” derivam de literatura TAPPI, white papers de fabricantes (Valmet, Voith) ou normas citadas; “média” indica faixas de patentes ou artigos técnicos; “baixa” sinaliza estimativa de engenharia quando a fonte pública é omissa. Nenhum TAG de planta real é usado — todos os TAGs são fictícios no padrão ISA-5.1.

---

# 1. Preparação de massa e circuito curto

## 1.1 Como funciona e por que

A preparação de massa condiciona as fibras para formar uma folha uniforme, com resistência e retenção adequadas. A refinação desenvolve as fibras (fibrilação e corte), aumentando a área superficial e a capacidade de ligação, mas em excesso reduz a drenagem e a opacidade. Aditivos são dosados em pontos distintos do circuito curto:

- **Amido catiônico** (2–4% sobre fibra) atua como agente de resistência a seco e auxiliar de retenção, pois sua carga positiva ancora-se às fibras e finos aniônicos.
- **PCC** (carbonato de cálcio precipitado, 10–25% em papel alcalino) é carga mineral: melhora opacidade, alvura e lisura, mas reduz resistência e aumenta o desgaste de facas.
- **Cola interna (AKD/ASA)** hidrofobiza a fibra para controlar absorção (Cobb); requer cura em temperatura na secagem.
- **Auxiliar de retenção** (polímero catiônico de alto peso molecular) flocula finos e carga antes da caixa de entrada; sem ele, o “fines” retorna ao circuito de água branca e a gramatura fica instável.
- **Alvejante óptico (OBA)** compensa o amarelecimento da fibra e eleva a alvura perceptual.

O circuito curto inclui tanque de mistura (machine chest), bomba de mistura, depuração (cleaners centrífugos) e desaeração (remoção de ar dissolvido, que causa espuma e bolhas na folha). A consistência de massa grossa no tanque de máquina fica tipicamente em **2,5–3,5%**; após a bomba de mistura e diluição no fan pump, cai para **0,5–1,0%** na aproximação da caixa de entrada.

## 1.2 Variáveis principais

| Nome | TAG ISA-5.1 (fictício) | Unidade | Faixa típica | Onde é medida | Instrumento | Frequência típica | Controlada? | MV (atuador) | Fonte / confiança |
|---|---|---|---|---|---|---|---|---|---|
| Consistência de massa grossa (machine chest) | AIT-101 | % | 2,5–3,5 | Tanque de máquina, saída | Transmissor de consistência (lâmina/vibratório) | Contínuo (1–5 s) | **Sim** (malha de consistência) | Válvula de diluição (FV-101) ou velocidade da bomba de massa grossa | Faixa típica de circuito curto; **média** |
| Vazão de massa grossa | FIT-102 | m³/h ou L/min | Conforme produção (ex.: 8.000–15.000 L/min para 75 g/m² a 1.250 m/min e 8 m) | Linha de massa grossa | Medidor magnético/Coriolis | Contínuo | **Sim** (malha de gramatura) | Velocidade da bomba de massa grossa (SC-102) ou válvula de controle | **Média** |
| Consistência de massa diluída (fan pump) | AIT-103 | % | 0,5–1,0 | Descarga do fan pump | Transmissor de consistência | Contínuo | **Sim** (cascata com consistência grossa) | Válvula de diluição (FV-103) | **Alta** (faixa de headbox) |
| Dosagem de amido catiônico | FIT-104 | L/h ou kg/t | 2–4% sobre fibra; vazão proporcional à massa seca | Linha de amido antes do machine chest | Medidor de vazão + bomba dosadora | Contínuo | **Sim** (ratio control) | Bomba dosadora (SC-104) | **Média** |
| Dosagem de PCC | FIT-105 | kg/t ou L/h | 10–25% sobre fibra (papel alcalino) | Linha de carga antes do fan pump | Medidor de vazão + densímetro | Contínuo | **Sim** (ratio control) | Bomba dosadora (SC-105) | **Média** |
| Dosagem de auxiliar de retenção | FIT-106 | L/h ou ppm | 0,02–0,1% sobre massa seca (faixa ampla) | Linha de aproximação da caixa | Medidor de vazão | Contínuo | **Sim** (ratio control) | Bomba dosadora (SC-106) | **Baixa–média** (depende do sistema) |
| pH da massa | AIT-107 | – | 6,5–8,0 (papel alcalino) | Tanque de máquina ou linha de aproximação | Eletrodo de pH | Contínuo | Monitorada; correção manual ou dosagem de NaOH | Válvula de alkali (FV-107) | **Média** |

## 1.3 Malhas de controle e acoplamentos

- **Consistência de massa grossa × vazão de massa grossa:** a malha de consistência atua na diluição para manter a consistência de saída estável. A vazão de massa grossa é a MV da malha de gramatura (seca) — se a consistência oscila, a gramatura oscila mesmo com vazão constante. O acoplamento é **cruzado**: um aumento de consistência sem correção de vazão eleva a gramatura; a malha de gramatura corrige via vazão, mas com atraso de transporte.
- **Dosagem de aditivos × consistência:** dosagens em base seca (kg/t) devem ser corrigidas pela vazão de massa seca. Se a consistência cai, a mesma vazão de aditivo passa a dosar em excesso.
- **Retenção × cinzas × gramatura:** baixa retenção de finos/PCC faz com que o material retorne à água branca; a gramatura de cinzas cai e o QCS pode compensar aumentando carga, o que piora a retenção — um ciclo de instabilidade.

## 1.4 Alarmes típicos (ISA-18.2)

- Consistência de massa grossa > 4,0% (alto) ou < 2,0% (baixo) — prioridade média.
- Consistência diluída > 1,2% (alto) — risco de floculação excessiva e má formação.
- pH < 6,0 ou > 8,5 — prioridade alta (afeta retenção e cura da cola).
- Nível do tanque de máquina baixo (< 30%) — prioridade alta (risco de desabastecimento da caixa).
- Dosagem de retenção fora de faixa por mais de 5 min — prioridade baixa/média.

## 1.5 Falhas comuns

| Sintoma | Causa provável | Variáveis que antecipam |
|---|---|---|
| Gramatura oscilante em MD | Consistência instável, dosagem de retenção variável, ar no fan pump | AIT-101, AIT-103, FIT-106, vibração do fan pump |
| Formação fraca (flocos) | Consistência diluída alta, refinação excessiva, retenção baixa | AIT-103, consumo específico de refino (kWh/t), turbidez da água branca |
| Perda de resistência | Refinação insuficiente, excesso de PCC, cura incompleta da cola | Consumo de refino, teor de cinzas, temperatura na secagem |
| Espuma/bolhas na folha | Ar dissolvido no circuito curto, desaeração ineficiente | Nível de vácuo no desaerador, condutividade, dosagem de antiespumante |

---

# 2. Caixa de entrada (headbox)

## 2.1 Como funciona e por que

A caixa de entrada recebe a massa diluída, distribui-a transversalmente (CD) e a acelera através de um lábio (slice) para formar um jato que incide sobre a tela ou entre duas telas (gap former). O objetivo é entregar uma suspensão com **microturbulência controlada**, consistência baixa e perfil de vazão uniforme, para que a formação não seja nem floculada demais (consistência alta) nem excessivamente diluída (custo energético e perda de retenção). A relação jato/tela (jet-to-wire ratio, J/W) controla o grau de orientação das fibras: próximo de 1,0 para papel isotrópico; ligeiramente acima ou abaixo para ajustar anisotropia.

A caixa moderna usa **controle por diluição** em zonas CD (espaçamento típico de 60 mm), onde água de diluição é injetada para corrigir o perfil de gramatura antes da formação. O perfil de diluição varia tipicamente **3–20%**, com média em torno de **8–12%**. O lábio tem abertura fina (tipicamente **8–15 mm** em máquinas rápidas de papel fino) e o jato sai com velocidade próxima à da tela.

## 2.2 Variáveis principais

| Nome | TAG ISA-5.1 (fictício) | Unidade | Faixa típica | Onde é medida | Instrumento | Frequência típica | Controlada? | MV (atuador) | Fonte / confiança |
|---|---|---|---|---|---|---|---|---|---|
| Consistência na caixa | AIT-201 | % | 0,3–1,0 (papel fino; 0,5–1,0 típico) | Linha de aproximação ou interior da caixa | Transmissor de consistência | Contínuo | **Sim** (cascata da consistência diluída) | Válvula de diluição (FV-201) | **Alta** |
| Pressão de ar no topo da caixa (air pad) | PIC-202 | kPa | 20–60 kPa (depende do projeto) | Câmara de ar da caixa | Transmissor de pressão | Contínuo | **Sim** | Válvula de ar comprimido (PV-202) | **Média** (faixa de patentes) |
| Nível de massa na caixa | LIC-203 | mm ou % | 60–90% da altura | Caixa (lateral) | Transmissor de nível (radar/DP) | Contínuo | **Sim** | Válvula de vazão de entrada (FV-203) | **Média** |
| Abertura do lábio (slice) | ZI-204 (posição) | mm | 8–15 mm (papel fino rápido) | Mecanismo do lábio | Sensor de posição (LVDT) | Contínuo | **Sim** (perfil CD por atuadores) | Atuadores de lábio (ZC-204) | **Média–baixa** (faixa depende do fabricante) |
| Relação jato/tela (J/W) | SI-205 (calculado) | – | 0,95–1,05 (típico 0,98–1,02) | Calculado a partir de velocidade de jato e tela | Velocidade de bomba + velocidade da tela | Contínuo | **Sim** (indireta via pressão/velocidade) | Velocidade da bomba de massa (SC-205) | **Média** |
| Perfil de diluição CD | AI-206 (multi-zona) | % | 3–20% (média 8–12%) | Cada zona de diluição | Medidores de vazão por zona | Contínuo | **Sim** (malha CD de gramatura) | Válvulas de diluição por zona (FV-206A…n) | **Média** |

## 2.3 Malhas de controle e acoplamentos

- **Pressão da caixa × velocidade da tela:** a pressão (ou altura de massa) define a velocidade do jato. Se a velocidade da máquina muda (grade change ou ajuste), a pressão deve ser reajustada para manter J/W próximo do alvo; caso contrário, a orientação de fibras e a formação mudam.
- **Diluição CD × gramatura CD:** o QCS (scanner antes da colagem) mede o perfil CD e realimenta as zonas de diluição. O atuador é a válvula de cada zona; o acoplamento é **espacial** (uma zona afeta principalmente sua faixa, mas há espalhamento).
- **Nível × vazão de entrada:** a malha de nível estabiliza a carga sobre o lábio; se a vazão de massa oscila, a pressão da caixa oscila e o jato varia.

## 2.4 Alarmes típicos

- Pressão da caixa fora de ±10% do setpoint — prioridade média.
- Nível muito baixo (< 40%) — prioridade alta (risco de perda de carga e entrada de ar).
- Consistência na caixa > 1,2% — prioridade alta (floculação e má formação).
- Desvio de diluição em qualquer zona > 25% do valor médio — prioridade baixa/média.

## 2.5 Falhas comuns

| Sintoma | Causa provável | Variáveis precursoras |
|---|---|---|
| Perfil CD de gramatura com “barrigas” | Zona de diluição entupida, lábio desgastado/desalinhado | Vazão de diluição por zona, posição do lábio |
| Jato instável / formação ondulada | Ar na caixa, pressão oscilante, nível baixo | PIC-202, LIC-203, vibração da bomba |
| Orientação de fibras excessiva (MD/CD) | J/W muito alto ou muito baixo | SI-205 (calculado), velocidade relativa |

---

# 3. Formação (gap former, drenagem e retenção)

## 3.1 Como funciona e por que

No gap former, o jato é injetado entre duas telas. A drenagem começa imediatamente: a água é removida através das telas por gravidade, sapatas (formingshoe) e caixas de vácuo (MB units), enquanto as fibras se depositam formando uma folha contínua. A **retenção** é a fração de sólidos (fibras, finos, carga) que permanece na folha; baixa retenção significa que finos e PCC retornam à água branca, causando instabilidade de gramatura, sujeira no sistema e maior consumo de aditivos.

A física é de **filtração e floculação**: a consistência cresce ao longo da zona de formação. Dados de patente para gap former indicam:

- Consistência na caixa: **0,5–1,7%** (típico ~1,5%).
- Consistência após forming shoe: **0,9–3,0%** (típico ~2,2%).
- Consistência após MB unit: **7–12%** (típico ~10%).
- Consistência após segundo rolo formador: **10–14%** (típico ~13%).

A formação é um compromisso: consistência muito baixa melhora a dispersão, mas aumenta o volume de água a remover e o custo de vácuo; consistência muito alta gera flocos e formação irregular. A microturbulência no jato e a pulsação controlada nas caixas de vácuo quebram flocos sem desintegrar a folha.

## 3.2 Variáveis principais

| Nome | TAG ISA-5.1 (fictício) | Unidade | Faixa típica | Onde é medida | Instrumento | Frequência típica | Controlada? | MV (atuador) | Fonte / confiança |
|---|---|---|---|---|---|---|---|---|---|
| Vácuo na caixa de formação (MB unit) | PIC-301 | kPa | 0–30 kPa (0–0,3 bar); típico 10–25 kPa | Caixa de vácuo / tubulação | Transmissor de vácuo | Contínuo | **Sim** (malha de vácuo) | Válvula de controle de vácuo ou velocidade do soprador | **Média** (patente indica 0–20/0–30 kPa) |
| Consistência após MB unit | AIT-302 | % | 7–12 | Folha sobre a tela (saída da MB) | Transmissor de consistência (infravermelho/radiofrequência) | Contínuo (ou amostragem) | Monitorada (indicador de desempenho da formação) | — (não é MV direta) | **Média–alta** |
| Retenção total (first-pass retention) | Calculado (QI-303) | % | 70–90% (papel fino com retenção moderna) | Calculado por balanço de massa (consistência × vazões) | — | Amostragem horária ou cálculo em tempo real | Monitorada; dosagem de retenção é a MV indireta | Bomba dosadora de retenção (SC-303) | **Baixa–média** (faixa ampla) |
| Turbidez da água branca | AIT-304 | NTU ou mg/L | 100–1.500 mg/L (faixa ampla) | Água branca da tela | Turbidímetro | Contínuo | Monitorada | — (indicador de retenção) | **Baixa** (depende do sistema) |
| Velocidade da tela | SIC-305 | m/min | 1.200–1.300 (referência) | Rolo motriz da tela | Encoder | Contínuo | **Sim** (malha mestra de velocidade) | Acionamento do rolo (SC-305) | **Alta** (dado do projeto) |

## 3.3 Malhas de controle e acoplamentos

- **Vácuo × consistência de saída:** aumentar o vácuo remove mais água e eleva a consistência, mas excesso pode compactar a folha e reduzir a retenção de finos (arraste). O acoplamento é não linear: ganhos maiores em baixos vácuos.
- **Retenção × dosagem de polímero:** a malha de retenção (quando existe) atua na bomba dosadora; porém, a resposta é lenta (tempo de circulação da água branca) e afetada por consistência e pH.
- **Velocidade da tela × J/W:** já discutido na caixa; a velocidade da tela é a referência mestre para todas as seções seguintes (draw control).

## 3.4 Alarmes típicos

- Vácuo abaixo do mínimo para a velocidade atual — prioridade alta (drenagem insuficiente, folha molhada nas prensas).
- Consistência após MB < 6% em velocidade > 1.100 m/min — prioridade alta (risco de quebra na prensa).
- Retenção < 60% por mais de 15 min — prioridade média (perda de finos, instabilidade de gramatura).
- Turbidez da água branca > 2.000 mg/L — prioridade média (entupimento de showers, perda de carga).

## 3.5 Falhas comuns

| Sintoma | Causa provável | Variáveis precursoras |
|---|---|---|
| Folha com “buracos” ou fraca | Vácuo excessivo localizado, tela danificada, flocos grandes | Perfil de vácuo por caixa, inspeção de tela |
| Quebra na prensa por folha molhada | Consistência após formação baixa, drenagem insuficiente | AIT-302, PIC-301, velocidade vs. vácuo |
| Perfil CD de formação irregular | Distribuição de vácuo desigual, diluição desbalanceada | Perfil de vácuo CD, vazões de diluição |

---

# 4. Prensas

## 4.1 Como funciona e por que

A seção de prensas remove água por compressão mecânica entre rolos, reduzindo a carga térmica da secagem. A água é transferida da folha para os feltros e destes para os uhle boxes (caixas de sucção) e condicionadores. A sequidade após a prensa é o parâmetro econômico central: cada 1% adicional de secura reduz proporcionalmente o vapor na secagem.

Em máquinas modernas de papel fino, a prensa típica é **roll press + shoe press** (ou prensa de sapata estendida). Dados públicos:

- Secura após a tela (pick-up): **~20%**.
- Secura após primeiro nip (prensa de rolo): **25–33%**.
- Secura após prensa de sapata (extended nip): **48–54%**.
- Carga linear no primeiro nip: **10–120 kN/m**, tipicamente **30–80 kN/m**.
- Prensa de sapata: **600–1.000 kN/m**, nip de **180–290 mm**, com ganho de secura de **5–10%** sobre prensa de rolo.

A prensa de sapata é decisiva para papel fino de alta velocidade: o nip longo aumenta o tempo de residência sob pressão, permitindo remover água sem cargas de pico que danifiquem a folha.

## 4.2 Variáveis principais

| Nome | TAG ISA-5.1 (fictício) | Unidade | Faixa típica | Onde é medida | Instrumento | Frequência típica | Controlada? | MV (atuador) | Fonte / confiança |
|---|---|---|---|---|---|---|---|---|---|
| Carga linear no nip da prensa de rolo | WIC-401 | kN/m | 10–120 (típico 30–80) | Cilindro hidráulico do nip | Transmissor de pressão/célula de carga | Contínuo | **Sim** | Válvula proporcional de pressão hidráulica (PV-401) | **Alta** |
| Carga linear na prensa de sapata | WIC-402 | kN/m | 600–1.000 | Sapata / cilindros de carga | Célula de carga / pressão | Contínuo | **Sim** | Pressão hidráulica da sapata (PV-402) | **Alta** |
| Secura após prensa (entrada da secagem) | AIT-403 | % | 45–55 (depende da configuração) | Folha após último nip (ou cálculo por scanner) | Scanner de umidade (infravermelho) ou amostragem | Contínuo (scanner) / horária (lab) | Monitorada; meta operacional | — (a MV é a carga da prensa) | **Média–alta** |
| Umidade do feltro (após uhle box) | AIT-404 | g/m² ou % | 900–1.200 g/m² (feltro saturado); meta < 1.000 | Feltro antes do nip | Medidor de umidade de feltro (opcional) | Contínuo | Monitorada (condicionamento) | Vácuo do uhle box (PIC-404) | **Média** |
| Vácuo do uhle box | PIC-405 | kPa | 20–50 kPa (faixa típica) | Caixa de sucção do feltro | Transmissor de vácuo | Contínuo | **Sim** | Válvula de vácuo / velocidade do soprador | **Baixa–média** |

## 4.3 Malhas de controle e acoplamentos

- **Carga da prensa × secura:** aumentar a carga remove mais água, mas acima de um limite a folha compacta e a secura não melhora (ou piora a qualidade). A malha é normalmente **manual/otimizada**, não automática, porque o ganho é não linear e o risco de dano à folha é alto.
- **Vácuo do uhle box × umidade do feltro:** feltro muito úmido devolve água à folha no nip; a malha de vácuo deve manter o feltro condicionado. O acoplamento com a carga da prensa é indireto.
- **Velocidade × carga:** em velocidade maior, o tempo de residência no nip diminui; para manter a secura, a carga pode precisar aumentar (ou o nip de sapata compensa).

## 4.4 Alarmes típicos

- Carga da prensa de sapata > 1.050 kN/m — prioridade alta (risco de dano à sapata e à folha).
- Secura após prensa < 42% em velocidade > 1.200 m/min — prioridade alta (risco de quebra na secagem).
- Vácuo do uhle box < 15 kPa — prioridade média (feltro encharcado).
- Diferença de carga entre lados do nip > 10% — prioridade média (perfil de umidade desigual).

## 4.5 Falhas comuns

| Sintoma | Causa provável | Variáveis precursoras |
|---|---|---|
| Quebra na prensa | Folha seca demais (frágil) ou molhada demais (sem resistência), feltro danificado | AIT-403, AIT-404, vibração do rolo |
| Perfil de umidade CD com “bordas molhadas” | Carga de nip desbalanceada, coroa do rolo inadequada | Carga por lado, perfil de umidade CD |
| Marcas de feltro na folha | Feltro entupido, condicionamento insuficiente | Vácuo do uhle box, permeabilidade do feltro |

---

# 5. Secagem (pré-secagem com cilindros, capota, vapor e condensado)

## 5.1 Como funciona e por que

A secagem remove água por evaporação, usando cilindros aquecidos a vapor. A folha entra com **45–55%** de sólidos e sai com **92–96%** de sólidos (umidade final **4–8%** para papel de imprimir e escrever). A transferência de calor ocorre por contato: o vapor condensa dentro do cilindro, liberando calor latente; a água da folha evapora e é arrastada pelo ar da capota.

O sistema de vapor e condensado é o coração energético. Em máquinas de alta velocidade, usa-se **cascata**: vapor de alta pressão alimenta o primeiro grupo; o “blow-through” (vapor que atravessa o sifão sem condensar) e o vapor flash do condensado alimentam grupos de pressão progressivamente menor. Cada grupo tem controle de pressão e de diferencial de pressão (ΔP) entre o lado do vapor e o lado do condensado, para garantir que o condensado seja evacuado sem “inundar” o cilindro.

Valmet (white paper) descreve o sistema típico: a pressão é controlada por grupo; o ΔP é controlado em dois estágios — placas de orifício reduzem **20 kPa** e válvulas de controle ajustam o restante; o blow-through é restrito a **10–15%** do vapor de alimentação. Em máquinas de 1.200 m/min, as pressões dos grupos situam-se tipicamente na faixa de **1–5,5 bar** (100–550 kPa), dependendo do número de grupos e da carga de secagem.

O ΔP necessário para evacuar condensado depende do tipo de sifão e da velocidade. Em máquinas rápidas (> 900 m/min), sifões rotativos exigem ΔP da ordem de **80–100 kPa** (12–15 psid) para evitar inundação; sifões estacionários podem operar com ΔP menor, mas são mais sensíveis a altas velocidades.

## 5.2 Variáveis principais

| Nome | TAG ISA-5.1 (fictício) | Unidade | Faixa típica | Onde é medida | Instrumento | Frequência típica | Controlada? | MV (atuador) | Fonte / confiança |
|---|---|---|---|---|---|---|---|---|---|
| Pressão de vapor — Grupo 1 (primeiro) | PIC-501 | kPa (bar) | 300–550 kPa (3–5,5 bar) | Header do grupo 1 | Transmissor de pressão | Contínuo | **Sim** | Válvula de controle de vapor (PV-501) | **Média** (faixa de patente/Valmet) |
| Pressão de vapor — Grupo 2 | PIC-502 | kPa (bar) | 200–450 kPa (2–4,5 bar) | Header do grupo 2 | Transmissor de pressão | Contínuo | **Sim** | Válvula de controle (PV-502) | **Média** |
| ΔP (vapor–condensado) — Grupo 1 | PDIC-503 | kPa | 20–100 kPa (depende do sifão e velocidade) | Separador de condensado do grupo | Transmissor de pressão diferencial | Contínuo | **Sim** | Válvula de controle de ΔP (PV-503) ou orifício + válvula | **Alta** (Valmet: 20 kPa no orifício) |
| Umidade final da folha (saída da secagem) | AIT-504 | % | 4–8% (alvo típico 5,5–6,5%) | Scanner de umidade antes da colagem | Scanner IR | Contínuo (varredura) | **Sim** (malha de umidade) | Pressão de vapor do último grupo (PIC-50n) ou velocidade | **Alta** (QCS padrão) |
| Temperatura do ar da capota | TIC-505 | °C | 80–120°C (insuflamento); exaustão 70–90°C | Capota (insuflamento/exaustão) | Termopar/RTD | Contínuo | **Sim** | Válvula de vapor do trocador de ar (TV-505) | **Média** |
| Umidade relativa da capota | AI-506 | % | 40–70% (faixa operacional) | Capota | Sensor de umidade | Contínuo | Monitorada | — | **Baixa–média** |
| Telas secadoras — tensão | WIC-507 | kN/m | 2–6 kN/m (faixa típica) | Rolo de tensionamento | Célula de carga | Contínuo | **Sim** | Cilindro pneumático/hidráulico (PV-507) | **Baixa** |

## 5.3 Malhas de controle e acoplamentos

- **Pressão de vapor × umidade final:** a malha de umidade (QCS) atua na pressão do último grupo (ou na distribuição de pressão entre grupos). O acoplamento é **multivariável**: mexer no primeiro grupo afeta a umidade final com atraso de transporte (dezenas de segundos a minutos); mexer no último grupo tem resposta mais rápida, mas menor capacidade.
- **ΔP × inundação de cilindro:** se o ΔP é insuficiente, o condensado acumula, a transferência de calor cai, a umidade final sobe. A malha de ΔP é local e rápida; o operador deve monitorar o ΔP de cada grupo.
- **Capota × umidade:** ar muito úmido reduz a evaporação; a malha de temperatura/umidade da capota é secundária, mas essencial para evitar condensação sobre a folha.

## 5.4 Alarmes típicos

- ΔP < 15 kPa em grupo com sifão rotativo — prioridade alta (risco de inundação).
- Umidade final > 8,5% — prioridade alta (risco de quebra na calandra/enroladeira).
- Pressão de vapor do grupo > limite de projeto — prioridade alta.
- Temperatura da capota > 130°C ou < 60°C — prioridade média.

## 5.5 Falhas comuns

| Sintoma | Causa provável | Variáveis precursoras |
|---|---|---|
| Umidade final oscilante | ΔP insuficiente, sifão entupido, condensado acumulado | PDIC-503, temperatura do cilindro (se disponível) |
| Folha com “manchas” de umidade | Capota com condensação, ventilação insuficiente | Umidade relativa da capota, temperatura do ar |
| Consumo de vapor acima do esperado | Feltros secadores saturados, ΔP mal ajustado, vazamento de vapor | Vazão de vapor por grupo, ΔP |

---

# 6. Colagem superficial / film press (“Speed Sizer”)

## 6.1 Como funciona e por que

A colagem superficial aplica uma película de amido (e eventualmente pigmento) sobre uma ou ambas as faces da folha, após a pré-secagem. O objetivo é aumentar a resistência superficial (resistência ao arrancamento em impressão offset), reduzir a porosidade e melhorar a lisura, sem comprometer a opacidade. No **film press** (metered size press), o amido é dosado por uma barra/rolo dosador sobre um rolo aplicador, formando um filme fino que é transferido para a folha no nip.

Variáveis críticas:

- **Sólidos do amido:** tipicamente **10–16%** para film press; sólidos mais altos aumentam o pickup, mas elevam a viscosidade e o risco de padrões de filme (“film splitting”).
- **Viscosidade:** **25–40 cP a 100 rpm** (faixa Valmet); viscosidade alta dificulta a formação de filme uniforme em alta velocidade.
- **Temperatura:** controlada para manter viscosidade estável; amido degrada acima de ~70°C.
- **Carga de nip:** no film press, a carga é menor que na prensa de rolo (tipicamente **50–150 kN/m**), mas suficiente para transferir o filme e consolidar a superfície.

O film press aplica **por lado** (top/bottom) com circuitos independentes de amido, permitindo diferentes pickup em cada face (controle de curl). A quantidade aplicada (pickup) é tipicamente **2–8 g/m² por lado** (base seca), dependendo da porosidade da base e da viscosidade.

## 6.2 Variáveis principais

| Nome | TAG ISA-5.1 (fictício) | Unidade | Faixa típica | Onde é medida | Instrumento | Frequência típica | Controlada? | MV (atuador) | Fonte / confiança |
|---|---|---|---|---|---|---|---|---|---|
| Sólidos do amido (topo) | AIT-601 | % | 10–16% | Tanque de amido / linha de alimentação | Refratômetro/transmissor de sólidos | Contínuo ou amostragem | **Sim** (diluição) | Válvula de água de diluição (FV-601) | **Alta** |
| Viscosidade do amido (topo) | VIT-602 | cP | 25–40 cP a 100 rpm | Linha de amido | Viscosímetro em linha | Contínuo | Monitorada (temperatura é a MV) | Temperatura do trocador (TIC-602) | **Alta** |
| Temperatura do amido | TIC-603 | °C | 50–65°C (faixa típica) | Tanque/linha | RTD | Contínuo | **Sim** | Válvula de vapor/água de resfriamento (TV-603) | **Média** |
| Carga de nip do film press | WIC-604 | kN/m | 50–150 kN/m (faixa típica) | Cilindro hidráulico do nip | Célula de carga/pressão | Contínuo | **Sim** | Válvula proporcional (PV-604) | **Média** |
| Pickup de amido (por lado) | Calculado (QI-605) | g/m² | 2–8 g/m² (base seca) | Calculado por consumo e velocidade | — | Amostragem horária | Monitorada; MV é a velocidade da barra dosadora | Velocidade da barra dosadora (SC-605) | **Baixa–média** |
| Umidade da folha na entrada do film press | AIT-606 | % | 5–7% | Scanner antes do film press | Scanner IR | Contínuo | Monitorada | — (a MV é a secagem a montante) | **Alta** (QCS) |

## 6.3 Malhas de controle e acoplamentos

- **Sólidos × viscosidade × pickup:** a malha de sólidos atua na diluição; a viscosidade responde à temperatura e aos sólidos. Em alta velocidade, o aumento de sólidos eleva o pickup, mas pode gerar padrões de filme se a viscosidade não for compensada por temperatura.
- **Carga de nip × pickup:** maior carga aumenta a transferência e a penetração, mas pode compactar a folha e reduzir a lisura. O acoplamento com a umidade da folha é forte: folha mais úmida absorve mais amido, mas fica mais fraca no nip.
- **Pickup topo vs. bottom × curl:** o balanço de aplicação entre faces controla o curl; a malha é manual/otimizada, baseada em medição offline de curl.

## 6.4 Alarmes típicos

- Viscosidade > 60 cP — prioridade alta (risco de padrão de filme e quebra).
- Sólidos < 8% — prioridade média (pickup insuficiente, perda de resistência superficial).
- Carga de nip < 30 kN/m — prioridade média (transferência deficiente).
- Umidade da folha na entrada > 8% — prioridade alta (risco de quebra no nip).

## 6.5 Falhas comuns

| Sintoma | Causa provável | Variáveis precursoras |
|---|---|---|
| Padrões de filme (“orange peel”) | Viscosidade alta, velocidade alta, barra dosadora desgastada | VIT-602, velocidade da barra, vibração do rolo |
| Pickup baixo e irregular | Sólidos baixos, carga de nip baixa, folha muito fechada (baixa porosidade) | AIT-601, WIC-604, porosidade da base |
| Quebra no nip do film press | Folha molhada demais, carga excessiva, amido com bolhas | AIT-606, WIC-604, ar no amido |

---

# 7. Pós-secagem

## 7.1 Como funciona e por que

A pós-secagem remove a água introduzida pela colagem superficial (o film press reumedece a folha). A folha sai do film press com **umidade elevada** (tipicamente 8–15%, dependendo do pickup) e precisa retornar a **5–7%** antes da calandra e da enroladeira. A pós-secagem é geralmente menor que a pré-secagem (menos cilindros), mas é crítica para o perfil de umidade final e para evitar quebra na calandra.

O controle é semelhante ao da pré-secagem: pressão de vapor por grupo, ΔP de condensado e capota. Em máquinas modernas, a pós-secagem pode usar cilindros com **perfil de temperatura ajustável** (controle de curl) e, em alguns casos, secagem por ar quente ou infravermelho.

## 7.2 Variáveis principais

| Nome | TAG ISA-5.1 (fictício) | Unidade | Faixa típica | Onde é medida | Instrumento | Frequência típica | Controlada? | MV (atuador) | Fonte / confiança |
|---|---|---|---|---|---|---|---|---|---|
| Pressão de vapor — pós-secagem | PIC-701 | kPa | 150–400 kPa (1,5–4 bar) | Header do grupo de pós-secagem | Transmissor de pressão | Contínuo | **Sim** | Válvula de vapor (PV-701) | **Média** (faixa típica) |
| ΔP — pós-secagem | PDIC-702 | kPa | 20–80 kPa | Separador de condensado | Transmissor DP | Contínuo | **Sim** | Válvula de ΔP (PV-702) | **Média** |
| Umidade final (saída da pós-secagem) | AIT-703 | % | 5–7% (alvo típico 5,5–6,5%) | Scanner final antes da calandra | Scanner IR | Contínuo | **Sim** (malha de umidade) | Pressão de vapor do último grupo | **Alta** (QCS) |

## 7.3 Malhas e acoplamentos

- A malha de umidade final atua na pressão da pós-secagem. O acoplamento com a colagem é direto: aumento de pickup → mais água → necessidade de mais vapor. A umidade final também é influenciada pela calandra (que pode secar ou umedecer levemente) e pela enroladeira (tensão e velocidade).

## 7.4 Alarmes e falhas

- Umidade final > 8% → prioridade alta (risco de quebra na calandra e enroladeira).
- ΔP baixo → prioridade média (inundação).
- Falhas típicas: resposta lenta da pós-secagem a mudanças de pickup, condensado acumulado, capota com condensação.

---

# 8. Calandra (soft calender)

## 8.1 Como funciona e por que

A calandra compacta a superfície da folha em nips de alta pressão, reduzindo a espessura e a rugosidade (aumentando lisura e brilho). Na **soft calender**, um dos rolos é revestido com material polimérico (soft), o que distribui a pressão de forma mais uniforme e preserva o bulk (reduz menos a espessura para o mesmo ganho de lisura). O rolo metálico é aquecido (óleo térmico ou indução) para amolecer a superfície da fibra e permitir a deformação plástica controlada.

Dados de literatura (Enomae et al., 1997) para soft calendering de papel woodfree:

- Temperatura do rolo: **120°C e 177°C** (dois níveis estudados).
- Carga de nip: **175 e 350 kN/m**.
- Velocidade: **760 e 1.220 m/min**.
- **Temperatura** teve o maior efeito sobre brilho e rugosidade PPS.
- **Carga de nip** teve o maior efeito sobre espessura e resistência ao ar (porosidade).

Em papel de imprimir e escrever não revestido, a calandra não busca brilho alto (como em coated), mas sim **lisura e uniformidade** para impressão. A faixa de temperatura do rolo térmico fica tipicamente entre **80–150°C**, e a carga entre **100–350 kN/m**, dependendo do grau de lisura desejado.

## 8.2 Variáveis principais

| Nome | TAG ISA-5.1 (fictício) | Unidade | Faixa típica | Onde é medida | Instrumento | Frequência típica | Controlada? | MV (atuador) | Fonte / confiança |
|---|---|---|---|---|---|---|---|---|---|
| Carga de nip da calandra | WIC-801 | kN/m | 100–350 kN/m (faixa de literatura 175–350) | Cilindro hidráulico do nip | Célula de carga/pressão | Contínuo | **Sim** | Válvula proporcional (PV-801) | **Alta** |
| Temperatura do rolo térmico | TIC-802 | °C | 80–180°C (literatura 120–177°C) | Superfície do rolo metálico | Pirômetro/RTD de contato | Contínuo | **Sim** | Válvula de óleo térmico ou potência de indução (TV-802) | **Alta** |
| Espessura (caliper) após calandra | QIC-803 | µm | 75 g/m² → ~90–100 µm (depende do bulk) | Scanner final | Scanner de caliper (laser/contato) | Contínuo | Monitorada; meta de qualidade | — (a MV é a carga de nip) | **Alta** (QCS) |
| Lisura (PPS) após calandra | QIC-804 | µm | 3–6 µm (faixa típica para cut-size) | Scanner/laboratório | Medidor PPS em linha (opcional) | Amostragem | Monitorada | — | **Média–baixa** |
| Velocidade da calandra | SIC-805 | m/min | 1.200–1.300 | Rolo motriz | Encoder | Contínuo | **Sim** (mestre) | Acionamento (SC-805) | **Alta** (dado do projeto) |

## 8.3 Malhas e acoplamentos

- **Carga × espessura:** a malha de caliper (se existir) atua na carga; o ganho é alto e não linear. A temperatura também afeta a espessura (mais temperatura → mais compactação).
- **Temperatura × brilho/lisura:** a malha de temperatura é local (TIC-802). Um aumento de temperatura melhora a lisura, mas pode aumentar o risco de “marcação” e de aderência da folha ao rolo.
- **Velocidade × tempo de residência:** em velocidade maior, o tempo no nip diminui; para manter a lisura, pode ser necessário aumentar temperatura ou carga. O acoplamento é relevante em grade change.

## 8.4 Alarmes típicos

- Temperatura do rolo > 200°C — prioridade alta (risco de dano ao revestimento e à folha).
- Carga de nip > 400 kN/m — prioridade alta (risco de quebra e dano mecânico).
- Caliper fora de ±5% do alvo — prioridade média (qualidade).
- Vibração do rolo acima do limite ISO 20816-3 — prioridade alta (risco de marcação e falha).

## 8.5 Falhas comuns

| Sintoma | Causa provável | Variáveis precursoras |
|---|---|---|
| Lisura insuficiente | Temperatura baixa, carga baixa, rolo desgastado | TIC-802, WIC-801, vibração |
| Espessura excessivamente reduzida (perda de bulk) | Carga alta, temperatura alta, umidade alta na entrada | WIC-801, TIC-802, AIT-703 |
| Marcas periódicas na folha | Rolo danificado, vibração, envelopamento | Vibração (ISO 20816-3), análise de frequência |

---

# 9. Scanners / QCS (gramatura, umidade, espessura, cinzas, cor/brilho)

## 9.1 Como funciona e por que

O QCS (Quality Control System) mede continuamente as propriedades da folha em **MD** (máquina) e **CD** (transversal) por meio de scanners que varrem a largura da máquina. As medições fundamentais são:

- **Gramatura (basis weight):** por atenuação de radiação beta ou infravermelho.
- **Umidade:** por absorção infravermelha ou micro-ondas.
- **Espessura (caliper):** por sensores de contato ou laser.
- **Cinzas:** por fluorescência de raios X ou atenuação diferencial.
- **Cor/brilho:** por espectrofotometria.

Os scanners ficam em duas posições típicas: **antes da colagem** (para controle de gramatura e umidade da base) e **final** (antes da enroladeira, para controle de qualidade e certificação). A varredura é transversal (CD) e a média MD é calculada a partir das varreduras sucessivas.

O QCS alimenta malhas de controle MD (gramatura seca, umidade, cinzas) e malhas CD (perfil de diluição na caixa, perfil de vapor nos grupos, perfil de carga na calandra). A norma ISA-18.2 se aplica aos alarmes de desvio de qualidade.

## 9.2 Variáveis principais

| Nome | TAG ISA-5.1 (fictício) | Unidade | Faixa típica | Onde é medida | Instrumento | Frequência típica | Controlada? | MV (atuador) | Fonte / confiança |
|---|---|---|---|---|---|---|---|---|---|
| Gramatura (basis weight) | WIQ-901 | g/m² | 70–90 (alvo 75) | Scanner antes da colagem / final | Sensor beta/IR | Varredura a cada 20–60 s | **Sim** (malha MD de gramatura seca) | Vazão de massa grossa (FIT-102) | **Alta** (QCS padrão) |
| Umidade | MIQ-902 | % | 4–8% (alvo 5,5–6,5%) | Scanner antes/depois da secagem | Sensor IR | Varredura | **Sim** (malha de umidade) | Pressão de vapor (PIC-50n) | **Alta** |
| Espessura (caliper) | QIQ-903 | µm | ~90–100 µm (75 g/m²) | Scanner final | Sensor laser/contato | Varredura | **Sim** (malha de caliper) | Carga de nip da calandra (WIC-801) | **Alta** |
| Cinzas | AIQ-904 | % | 10–25% (depende da carga) | Scanner final | Sensor de fluorescência de raios X | Varredura | Monitorada; dosagem de PCC é a MV | Bomba dosadora de PCC (SC-105) | **Alta** |
| Cor / brilho | QIQ-905 | – (L*a*b*) | Faixa de especificação do produto | Scanner final | Espectrofotômetro | Varredura | Monitorada | — (a MV é o OBA na massa) | **Média** |
| Perfil CD de gramatura | WIQ-906 (multi-zona) | g/m² | ±1,5% do alvo (meta) | Scanner CD | Sensor beta + análise de perfil | Varredura | **Sim** (malha CD) | Válvulas de diluição por zona (FV-206A…n) | **Alta** |

## 9.3 Malhas e acoplamentos

- **Gramatura MD × vazão de massa:** a malha mais importante. O controlador MD ajusta a vazão de massa grossa (ou a velocidade da bomba) para manter a gramatura seca no alvo. O acoplamento com a consistência é crítico: se a consistência oscila, a malha de gramatura “persegue” a perturbação.
- **Umidade × pressão de vapor:** a malha de umidade atua na pressão do último grupo de secagem. O acoplamento com a gramatura é indireto (mais massa = mais água a evaporar).
- **Cinzas × dosagem de PCC:** a malha de cinzas (quando automática) ajusta a dosagem de carga. O acoplamento com a retenção é forte: baixa retenção faz a cinza cair, e o controlador aumenta a dosagem, piorando a retenção.
- **Perfil CD × diluição:** a malha CD atua nas zonas de diluição da caixa. O acoplamento espacial é significativo: uma zona afeta vizinhas, e o controle requer desacoplamento (matriz de resposta).

## 9.4 Alarmes típicos (ISA-18.2)

- Gramatura fora de ±3% do alvo por mais de 2 varreduras — prioridade média.
- Umidade final > 8% ou < 4% — prioridade alta.
- Caliper fora de ±5% do alvo — prioridade média.
- Cinzas fora de ±3 pontos percentuais — prioridade média.
- Desvio de perfil CD (2 sigma) > 2% da média — prioridade baixa/média.

## 9.5 Falhas comuns

| Sintoma | Causa provável | Variáveis precursoras |
|---|---|---|
| Gramatura MD com deriva lenta | Consistência de massa grossa derivando, entupimento de linha de diluição | AIT-101, FIT-102, tendência de AIT-103 |
| Perfil CD “quebrado” | Zona de diluição entupida, lábio danificado | Vazão de diluição por zona, posição do lábio |
| Umidade com oscilação rápida | ΔP de secagem oscilando, condensado | PDIC-503, pressão de vapor |
| Cinzas caindo sem mudança de dosagem | Retenção baixa, pH fora de faixa | AIT-107 (pH), turbidez da água branca |

---

# 10. Enroladeira Pope

## 10.1 Como funciona e por que

A enroladeira Pope enrola a folha em bobinas mestras (jumbos) sobre um cilindro de enrolamento (Pope cylinder). A folha vem da calandra sob tensão controlada; o rolo de bobina é pressionado contra o cilindro Pope por uma carga linear (nip de enrolamento), que varia com o diâmetro para manter a densidade e a estabilidade da bobina. Ao atingir o diâmetro alvo, a folha é cortada, a bobina é ejetada e um novo tubete é posicionado para iniciar a próxima bobina (troca de bobina).

A tensão da folha é controlada por **load cells** (células de carga) e o acionamento do cilindro Pope (ou do rolo de bobina) ajusta a velocidade relativa. A carga linear no nip de enrolamento é tipicamente **1–4 kN/m** (faixa de patente) e a pressão do rolo de enrolamento pode chegar a **10 kN/m** em situações de troca.

## 10.2 Variáveis principais

| Nome | TAG ISA-5.1 (fictício) | Unidade | Faixa típica | Onde é medida | Instrumento | Frequência típica | Controlada? | MV (atuador) | Fonte / confiança |
|---|---|---|---|---|---|---|---|---|---|
| Tensão da folha | WIC-1001 | kN/m (ou N) | 0,3–1,5 kN/m (faixa típica para papel fino) | Rolo guia / load cells | Célula de carga (Pressductor) | Contínuo | **Sim** | Velocidade do acionamento da enroladeira (SC-1001) | **Média** (faixa de patente) |
| Carga linear do nip de enrolamento | WIC-1002 | kN/m | 1–4 kN/m (operacional); até 10 kN/m na troca | Cilindro de carga do rolo de bobina | Célula de carga/pressão | Contínuo | **Sim** | Válvula proporcional (PV-1002) | **Alta** |
| Diâmetro da bobina | QIC-1003 (calculado) | mm | 1.000–2.500 mm (depende do projeto) | Cálculo por velocidade e tempo | — | Contínuo (calculado) | Monitorado | — | **Média** |
| Velocidade da folha na enroladeira | SIC-1004 | m/min | 1.200–1.300 | Cilindro Pope | Encoder | Contínuo | **Sim** (mestre) | Acionamento (SC-1004) | **Alta** |
| Umidade da folha na entrada | AIT-1005 | % | 5–7% | Scanner final | Scanner IR | Contínuo | Monitorada | — | **Alta** |

## 10.3 Malhas e acoplamentos

- **Tensão × carga do nip:** a tensão é controlada pela velocidade relativa; a carga do nip é controlada pela pressão hidráulica. O acoplamento é importante: aumento de tensão sem ajuste de carga pode “apertar” a bobina e gerar bloqueio (blocking).
- **Diâmetro × carga:** a carga linear deve ser reduzida à medida que o diâmetro cresce, para manter a densidade uniforme. A malha é programada (rampa) em função do diâmetro calculado.
- **Velocidade × tensão:** em grade change ou mudança de velocidade, a tensão deve ser reajustada para evitar quebra ou enrolamento frouxo.

## 10.4 Alarmes típicos

- Tensão > 2,0 kN/m — prioridade alta (risco de quebra).
- Carga do nip > 5 kN/m durante enrolamento normal — prioridade média (risco de bloqueio).
- Diâmetro alvo atingido sem troca automática — prioridade média.
- Desvio de tensão > 20% do setpoint — prioridade alta.

## 10.5 Falhas comuns

| Sintoma | Causa provável | Variáveis precursoras |
|---|---|---|
| Bobina com “bloqueio” (blocking) | Carga de nip alta demais, tensão alta, umidade alta | WIC-1002, WIC-1001, AIT-1005 |
| Bobina frouxa / telescópica | Tensão baixa, carga baixa, desalinhamento | WIC-1001, WIC-1002 |
| Quebra na troca de bobina | Sincronismo de corte, adesão da folha, tensão transitória | Sequência de troca, WIC-1001 |

---

# 11. Sistemas de apoio

## 11.1 Vácuo

O sistema de vácuo alimenta as caixas de formação, uhle boxes, desaerador e caixas de sucção das prensas. Sopradores de anel líquido ou ventiladores centrífugos geram vácuo; a pressão é controlada por válvulas ou por velocidade variável. A falha de vácuo em qualquer ponto crítico causa perda de drenagem, folha molhada e quebra.

**Variáveis típicas:** vácuo de formação **10–30 kPa**; vácuo de uhle box **20–50 kPa**; vácuo de desaerador **20–40 kPa**.

## 11.2 Água branca e save-all

A água branca retorna finos e carga ao circuito curto. O **save-all** (filtro a disco, tambor ou flotação) clarifica a água para reutilização em showers e diluição. A consistência da água branca típica é **0,05–0,5%** (500–5.000 mg/L). Baixa eficiência do save-all aumenta a carga de sólidos no efluente e causa entupimento de showers.

## 11.3 Refugo (broke) e desagregadores

O broke (folha descartada em quebras, bordas aparadas, bobinas rebaixadas) é recolhido, desagregado em pulper e reinjetado na massa. A taxa típica de broke é **5–20%** da produção. Durante quebras, o broke úmido é fácil de repulpar; broke seco (bobinas) requer desagregador de alta shear. O sistema de broke está acoplado ao circuito de água branca: uma quebra grande consome água branca rapidamente e pode baixar o nível de tanques.

## 11.4 Acionamentos seccionais

A máquina é dividida em seções (tela, prensas, secagem, calandra, enroladeira), cada uma com motor e inversor. O controle é **mestre-escravo** com **load sharing**: a velocidade da seção é sincronizada, mas cada motor contribui com torque proporcional à sua capacidade. O “draw” (diferença de velocidade entre seções) controla a tensão da folha. Falha de sincronismo causa quebra ou estiramento excessivo.

## 11.5 Lubrificação, óleo térmico e ar comprimido

- **Lubrificação de mancais:** sistemas de óleo circulante para rolos de prensa, cilindros secadores e calandra; falha de lubrificação leva a superaquecimento e falha de rolamento em 1–3 semanas (manutenção preditiva).
- **Óleo térmico:** aquece o rolo da calandra; controle de temperatura e vazão é crítico para lisura e segurança.
- **Ar comprimido:** instrumentação e atuadores; queda de pressão causa falha de válvulas e posicionadores.

---

# 12. Qualidade do produto final (ensaios de laboratório)

## 12.1 Propriedades e métodos

As propriedades finais são medidas em laboratório por amostragem de bobinas, além do QCS em linha. A tabela abaixo resume os ensaios típicos para papel de imprimir e escrever não revestido (cut-size).

| Propriedade | Método típico (TAPPI/ISO) | Faixa típica (75 g/m²) | Relevância |
|---|---|---|---|
| Gramatura | TAPPI T410 / ISO 536 | 75 g/m² ± 2% | Controle de consumo e uniformidade |
| Umidade | TAPPI T412 / ISO 287 | 5–7% | Estabilidade dimensional, impressão |
| Espessura (caliper) | TAPPI T411 / ISO 534 | 90–100 µm | Bulk, lisura, rigidez |
| Lisura (PPS) | TAPPI T555 | 3–6 µm | Qualidade de impressão |
| Porosidade (Gurley) | TAPPI T460 | 20–60 s (faixa típica) | Penetração de tinta, colagem |
| Tração (MD/CD) | TAPPI T494 / ISO 1924 | 4–7 kN/m (MD); 2–4 kN/m (CD) | Resistência à ruptura em impressão |
| Rasgo (Elmendorf) | TAPPI T414 / ISO 1974 | 400–700 mN (MD/CD depende) | Resistência ao manuseio |
| Cinzas | TAPPI T413 / ISO 2144 | 10–25% | Teor de carga; afeta opacidade e resistência |
| Alvura (brightness) | TAPPI T452 / ISO 2470 | 90–96% ISO | Aparência |
| Opacidade | TAPPI T425 / ISO 2471 | 85–92% | Legibilidade em frente e verso |
| Cobb (absorção de água) | TAPPI T441 / ISO 535 | 20–40 g/m² (1 min) | Colagem superficial/interna |
| Curl | TAPPI T520 / método interno | ≤ 5 mm (faixa de aceitação) | Estabilidade em pilha e impressão |

As faixas são típicas para cut-size e variam com a composição fibrosa e o grau de calandragem; a confiança é **média** porque dependem da especificação exata do produto.

## 12.2 Relação com o processo

- **Lisura e porosidade** são definidas na formação, prensagem, colagem e calandra. A calandra é o último ajuste.
- **Tração e rasgo** dependem da refinação e da retenção de finos; excesso de carga reduz resistência.
- **Cobb** depende da cola interna (AKD/ASA) e da cura na secagem; colagem superficial complementa.
- **Curl** depende do balanço de pickup entre faces, da secagem diferencial e da tensão de enrolamento.

---

# 13. Tópicos transversais

## 13.1 Quebra de folha

**Causas típicas por seção:**

- **Formação:** folha fraca por baixa retenção, flocos, vácuo excessivo localizado.
- **Prensas:** folha molhada demais (secura < 40%) ou seca demais (frágil), feltro danificado, carga desbalanceada.
- **Secagem:** umidade final > 8,5%, ΔP insuficiente (inundação), condensado sobre a folha.
- **Film press:** folha molhada, viscosidade alta, bolhas no amido.
- **Calandra:** carga excessiva, vibração, folha com umidade alta.
- **Enroladeira:** tensão excessiva, carga de nip alta, desalinhamento.

**Sinais precursores:** aumento de tensão MD (load cells), oscilação de umidade final, aumento de vibração em rolos, variação de vácuo, aumento de turbidez da água branca.

**Tempo médio de reengate:** tipicamente **5–15 min** para máquinas de papel fino, dependendo da seção e da complexidade da enfiação. Em máquinas de alta velocidade, o reengate pode ser mais rápido (3–8 min) com sistemas automáticos de enfiação, mas a estabilização completa da qualidade leva **15–30 min**.

**Impacto em produção:** uma quebra de 10 min em uma máquina de 75 g/m², 8 m de largura e 1.250 m/min deixa de produzir aproximadamente **12–15 toneladas** (cálculo: 8 m × 1.250 m/min × 75 g/m² × 10 min ≈ 7.500 kg, considerando eficiência; na prática, 10–15 t). O broke gerado retorna ao processo, mas com custo energético e de aditivos.

## 13.2 Troca de gramatura (grade change)

**Sequência típica:**

1. **Preparação (30 min antes):** ajuste de receitas de massa, dosagens de aditivos e setpoints de secagem.
2. **Rampa de vazão de massa (stock flow):** a vazão é alterada gradualmente (rampa) para o novo alvo de gramatura; a velocidade da máquina é ajustada em paralelo para manter a produção.
3. **Ajuste de consistência:** a consistência diluída é corrigida para o novo alvo.
4. **Ajuste de vapor:** a pressão de secagem é rampeada para compensar a nova carga de água.
5. **Ajuste de calandra e enroladeira:** carga, temperatura e tensão são ajustadas para o novo produto.

**O que muda primeiro:** a vazão de massa (ou a velocidade) é a primeira variável a ser rampeada; a consistência e o vapor seguem com atrasos de transporte. A gramatura medida no scanner é a última a estabilizar.

**Tempo de estabilização:** tipicamente **10–30 min** para a gramatura e umidade atingirem a faixa de especificação; a estabilização completa (perfil CD incluso) pode levar **30–60 min**.

**Bobinas rebaixadas:** o produto produzido durante a transição (até a estabilização) é geralmente **rebaixado** (broke ou qualidade inferior), a menos que o controle seja muito preciso. A meta é minimizar o broke de grade change.

## 13.3 Indicadores de produção

- **Eficiência (uptime):** (tempo de operação efetiva / tempo total programado) × 100%. Inclui paradas por quebra, manutenção e setup.
- **Tempo efetivo:** tempo em que a máquina produz folha vendável.
- **Refugo (broke):** (produção de broke / produção bruta) × 100%. Típico **5–20%**; meta < 10% em máquinas modernas.
- **Produção (t/h):** `P = (largura útil × velocidade × gramatura × 60) / 1.000.000` (com largura em m, velocidade em m/min, gramatura em g/m²). Exemplo: 8 m × 1.250 m/min × 75 g/m² × 60 / 1.000.000 ≈ **45 t/h** (bruto, 100% eficiência). Com eficiência de 90% e refugo de 5%, a produção líquida vendável cai para ~38–39 t/h.
- **Produção por turno (8 h):** produção horária × 8 × eficiência do turno.

## 13.4 Manutenção preditiva

**Equipamentos críticos e técnicas:**

- **Rolamentos de cilindros secadores, rolos de prensa e calandra:** vibração (ISO 20816-3), envelope de aceleração para defeitos de rolamento, temperatura de mancal, termografia. Lead time típico de detecção: **1–3 semanas** antes da falha.
- **Sopradores de vácuo:** vibração, corrente do motor, temperatura.
- **Bombas de massa e fan pump:** vibração, pressão, corrente.
- **Sistema de óleo térmico:** análise de óleo (viscosidade, contaminação, TAN), vazamento.
- **Feltros e telas:** monitoramento de permeabilidade e umidade do feltro (preditivo de condicionamento).

A análise de óleo e a termografia complementam a vibração para mancais de óleo circulante e componentes elétricos.

## 13.5 Rotina do turno

- **Passagem de turno:** revisão de eventos (quebras, grade changes, alarmes), condições de qualidade, níveis de tanques, estoque de aditivos, notas de manutenção.
- **Rondas de inspeção:** verificação visual de vazamentos, feltros, telas, showers, temperatura de mancais, ruído anormal, vibração perceptível.
- **Registro de quebras:** seção, tempo, causa provável, tempo de reengate, ações tomadas.
- **Notas de manutenção:** ordens de serviço para anomalias identificadas, priorizadas por criticidade.

---

# Catálogo de variáveis (CSV)

O catálogo abaixo contém as variáveis principais de cada seção, com as colunas solicitadas. TAGs são fictícios (ISA-5.1). Valores de faixa e típicos seguem as fontes discutidas; confiança é indicada.

```csv
secao,subsecao,nome,tag_isa_exemplo,unidade,faixa_min,faixa_max,valor_tipico,medicao,instrumento,frequencia,controlada,mv_atuador,limites_alarme,depende_de,afeta,fonte,confianca
1,Circuito curto,Consistência massa grossa,AIT-101,%,2.5,3.5,3.0,Tanque de máquina,Transmissor de consistência,Contínuo,sim,Válvula de diluição FV-101,>4.0 / <2.0,Diluição,Consistência diluída,Faixa típica,média
1,Circuito curto,Vazão massa grossa,FIT-102,L/min,8000,15000,12000,Linha de massa grossa,Medidor magnético,Contínuo,sim,Velocidade bomba SC-102,<70% do setpoint,Consistência,Gramatura,Faixa típica,média
1,Circuito curto,Consistência diluída,AIT-103,%,0.5,1.0,0.8,Fan pump,Transmissor de consistência,Contínuo,sim,Válvula diluição FV-103,>1.2,Consistência grossa,Formação,Literatura,alta
2,Caixa de entrada,Pressão da caixa,PIC-202,kPa,20,60,40,Câmara de ar,Transmissor de pressão,Contínuo,sim,Válvula de ar PV-202,±10% SP,Vazão de massa,Jato/tela,Patente,média
2,Caixa de entrada,Nível da caixa,LIC-203,%,60,90,80,Caixa,Transmissor de nível,Contínuo,sim,Válvula entrada FV-203,<40%,Vazão de massa,Pressão da caixa,Faixa típica,média
2,Caixa de entrada,Abertura do lábio,ZI-204,mm,8,15,12,Mecanismo do lábio,Sensor LVDT,Contínuo,sim,Atuador ZC-204,Fora de ±5%,Perfil CD,Gramatura CD,Faixa típica,média
2,Caixa de entrada,Relação jato/tela,SI-205,-,0.95,1.05,1.00,Calculado,Encoder + vazão,Contínuo,sim,Velocidade bomba SC-205,<0.90 / >1.10,Velocidade tela,Orientação fibras,Faixa típica,média
3,Formação,Vácuo MB unit,PIC-301,kPa,10,25,18,Caixa de vácuo,Transmissor de vácuo,Contínuo,sim,Válvula/soprador,<8 kPa,Velocidade tela,Consistência saída,Patente,média
3,Formação,Consistência após MB,AIT-302,%,7,12,10,Saída MB,Transmissor consistência,Contínuo,monitorada,-,<6%,Vácuo,Secura prensa,Patente,alta
4,Prensas,Carga prensa rolo,WIC-401,kN/m,30,80,60,Cilindro hidráulico,Célula de carga,Contínuo,sim,Válvula PV-401,>100,Secura entrada,Secura saída,Patente,alta
4,Prensas,Carga prensa sapata,WIC-402,kN/m,600,1000,800,Cilindros de carga,Célula de carga,Contínuo,sim,Pressão PV-402,>1050,Secura entrada,Secura saída,Patente,alta
4,Prensas,Secura após prensa,AIT-403,%,45,55,50,Scanner umidade,Scanner IR,Contínuo,monitorada,-,<42%,Carga prensa,Umidade final,Literatura,média
5,Secagem,Pressão vapor grupo 1,PIC-501,kPa,300,550,450,Header grupo 1,Transmissor pressão,Contínuo,sim,Válvula PV-501,>600,Vazão massa,Umidade final,Patente,média
5,Secagem,ΔP grupo 1,PDIC-503,kPa,20,100,60,Separador condensado,Transmissor DP,Contínuo,sim,Válvula PV-503,<15,Sifão,Inundação,Valmet,alta
5,Secagem,Umidade final,AIT-504,%,4,8,6,Scanner umidade,Scanner IR,Contínuo,sim,Pressão vapor PIC-50n,>8.5 / <4.0,Secagem,Qualidade,ISO,alta
6,Film press,Sólidos amido,AIT-601,%,10,16,12,Tanque amido,Refratômetro,Contínuo,sim,Diluição FV-601,<8%,Viscosidade,Pickup,Patente,alta
6,Film press,Viscosidade amido,VIT-602,cP,25,40,32,Linha amido,Viscosímetro,Contínuo,monitorada,Temperatura TIC-602,>60, Temperatura,Pickup,Valmet,alta
6,Film press,Carga nip film press,WIC-604,kN/m,50,150,100,Cilindro hidráulico,Célula de carga,Contínuo,sim,Válvula PV-604,<30,Pickup,Folha,Faixa típica,média
7,Pós-secagem,Pressão vapor pós,PIC-701,kPa,150,400,300,Header pós,Transmissor pressão,Contínuo,sim,Válvula PV-701,>450,Pickup,Umidade final,Faixa típica,média
7,Pós-secagem,Umidade final pós,AIT-703,%,5,7,6,Scanner final,Scanner IR,Contínuo,sim,Pressão vapor,>8%,Film press,Calandra,ISO,alta
8,Calandra,Carga nip calandra,WIC-801,kN/m,100,350,250,Cilindro hidráulico,Célula de carga,Contínuo,sim,Válvula PV-801,>400,Umidade entrada,Caliper,Literatura,alta
8,Calandra,Temperatura rolo térmico,TIC-802,°C,80,180,130,Superfície rolo,Pirômetro/RTD,Contínuo,sim,Válvula TV-802,>200,Carga nip,Lisura,Literatura,alta
8,Calandra,Caliper após calandra,QIC-803,µm,90,100,95,Scanner final,Scanner laser,Contínuo,monitorada,-,±5%,Carga/Temp,Qualidade,QCS,alta
9,QCS,Gramatura,WIQ-901,g/m²,70,90,75,Scanner,Scanner beta,Varredura,sim,Vazão massa FIT-102,±3%,Massa,Qualidade,ISO,alta
9,QCS,Umidade,MIQ-902,%,4,8,6,Scanner,Scanner IR,Varredura,sim,Pressão vapor,±1.5%,Secagem,Qualidade,ISO,alta
9,QCS,Cinzas,AIQ-904,%,10,25,18,Scanner,Fluorescência X,Varredura,monitorada,Dosagem PCC,±3 pp,Retenção,Opacidade,ISO,alta
10,Enroladeira,Tensão folha,WIC-1001,kN/m,0.3,1.5,0.8,Load cells,Célula de carga,Contínuo,sim,Velocidade SC-1001,>2.0,Nip,Quebra,Patente,média
10,Enroladeira,Carga linear nip,WIC-1002,kN/m,1,4,2.5,Cilindro de carga,Célula de carga,Contínuo,sim,Válvula PV-1002,>5,Tensão,Bloqueio,Patente,alta
```

---

# 15 relações causa-efeito para o simulador

As relações abaixo expressam sentido e ordem de grandeza, com base nas faixas e na física discutidas. Os atrasos são estimativas de engenharia para uma máquina de ~1.200 m/min; a confiança é indicada.

1. **+10 kPa no vácuo da MB unit (formação) → +0,3 a +0,6 ponto percentual na consistência após a MB, com atraso de ~1–3 s** (resposta rápida de drenagem). *Confiança: média.*
2. **+10% na vazão de massa grossa → +7 a +10% na gramatura seca (antes de correção do QCS), com atraso de transporte de ~30–60 s** (tempo de percurso da caixa ao scanner). *Confiança: alta.*
3. **+0,2 ponto percentual na consistência diluída (caixa) → +0,2 a +0,4% na gramatura, com atraso de ~20–40 s**; acima de 1,2% a formação piora (flocos) e a retenção cai. *Confiança: média.*
4. **+10 kPa no ΔP do grupo de secagem → −0,2 a −0,5 ponto percentual na umidade final, com atraso de ~60–120 s** (resposta térmica do cilindro). *Confiança: média.*
5. **+1% na secura após a prensa (ex.: 48% → 49%) → −4 a −6% no vapor necessário na secagem, com efeito imediato na carga térmica** (cada 1% de secura economiza proporcionalmente vapor). *Confiança: alta.*
6. **+10 kN/m na carga da prensa de sapata → +0,3 a +0,8 ponto percentual na secura após prensa, com atraso de ~5–15 s** (resposta mecânica do nip). *Confiança: média.*
7. **+5°C na temperatura do rolo da calandra → +2 a +5% na lisura (redução de PPS) e −0,5 a −1,5 µm no caliper, com atraso de ~10–30 s** (aquecimento da superfície). *Confiança: média.*
8. **+50 kN/m na carga da calandra → −2 a −4 µm no caliper e +3 a +6% na lisura, com atraso de ~5–15 s**; acima de 350 kN/m o risco de perda de bulk e quebra aumenta. *Confiança: alta.*
9. **+1% nos sólidos do amido (film press) → +0,5 a +1,5 g/m² no pickup por lado, com atraso de ~30–60 s** (resposta da dosagem e do filme). *Confiança: média.*
10. **+10 cP na viscosidade do amido → +5 a +10% no pickup, mas acima de 50 cP o risco de padrão de filme e quebra no nip aumenta, com atraso de ~20–40 s**. *Confiança: média.*
11. **+10% na carga de retenção (dosagem de polímero) → +3 a +8% na retenção de finos, com atraso de ~2–5 min** (tempo de circulação da água branca). *Confiança: baixa–média.*
12. **+0,5 ponto de pH (para fora da faixa 6,5–8,0) → −5 a −15% na eficiência de retenção e +2 a +5% no consumo de cola, com atraso de ~1–3 min** (efeito na carga superficial das fibras). *Confiança: média.*
13. **+10% na tensão da folha na enroladeira → +1 a +3% na densidade da bobina e maior risco de bloqueio, com efeito imediato** (resposta elástica). *Confiança: média.*
14. **+1 kN/m na carga linear do nip de enrolamento → +2 a +5% na densidade da bobina, com efeito imediato**; acima de 4 kN/m o risco de bloqueio aumenta. *Confiança: alta.*
15. **+1% na umidade da folha na entrada da calandra (ex.: 6% → 7%) → +1 a +2 µm no caliper e −3 a −6% na lisura, com atraso de ~10–20 s** (amolecimento da fibra). *Confiança: média.*

---

# Glossário PT-BR ↔ EN (termos de chão de fábrica)

| PT-BR | EN |
|---|---|
| Caixa de entrada | Headbox |
| Tela formadora | Forming fabric / wire |
| Gap former | Gap former |
| MB unit (caixa de vácuo) | MB unit / vacuum box |
| Forming shoe | Forming shoe |
| Rolo formador | Forming roll |
| Prensa de sapata | Shoe press |
| Nip | Nip |
| Feltro | Press felt |
| Uhle box | Uhle box / suction box |
| Cilindro secador | Dryer cylinder / can |
| Capota | Hood |
| Sifão rotativo | Rotary siphon |
| Sifão estacionário | Stationary siphon |
| Blow-through | Blow-through steam |
| Cascata de vapor | Steam cascade |
| ΔP (diferencial de pressão) | Differential pressure |
| Film press / Speed Sizer | Film press / metered size press |
| Rolo aplicador | Applicator roll |
| Barra dosadora | Metering rod / blade |
| Calandra soft | Soft calender |
| Rolo térmico | Thermal roll / heated roll |
| Enroladeira Pope | Pope reel |
| Bobina mestra / jumbo | Parent reel / jumbo roll |
| Troca de bobina | Reel turn-up |
| Emenda | Splice |
| Refugo / broke | Broke |
| Desagregador | Pulper / repulper |
| Água branca | White water |
| Save-all | Save-all / clarifier |
| Consistência | Consistency |
| Gramatura | Basis weight |
| Umidade | Moisture |
| Espessura / caliper | Caliper |
| Lisura | Smoothness |
| Porosidade | Porosity |
| Alvura | Brightness |
| Opacidade | Opacity |
| Cobb | Cobb size / water absorption |
| Curl | Curl |
| Tração | Tensile strength |
| Rasgo | Tear strength |
| Cinzas | Ash content |
| Retenção | Retention |
| Floculação | Flocculation |
| Grade change | Grade change |
| Quebra de folha | Web break |
| Reengate | Rethreading |
| Eficiência | Uptime / efficiency |
| Manutenção preditiva | Predictive maintenance |
| Análise de vibração | Vibration analysis |
| Termografia | Thermography |
| Análise de óleo | Oil analysis |

---

# Fontes públicas consultadas

1. **TAPPI Pressing and Drying Seminar / TAPPI Journal** — “The limits of pressing” (secura após prensa, cargas de nip, ganhos de feltro). Disponível em: `imisrise.tappi.org` (acesso restrito TAPPI; faixas citadas em resultados de busca).
2. **Valmet White Paper** — “Steam & Condensate System Improvements” (controle de ΔP, cascata, blow-through 10–15%, pressões típicas). Disponível em: `https://new.valmet.com/globalassets/media/downloads/white-papers/drying-and-air-systems/wpd_steamcondensate.pdf`.
3. **Valmet** — “Helpful tips for size pressing: properties, load, vibration…” (viscosidade 25–40 cP, pickup, vibração). Disponível em: `https://www.valmet.com/insights/articles/up-and-running/performance/SizePressNotes/`.
4. **Enomae, T., Huang, T., LePoutre, P.** — “Softcalendering: Effect of temperature, pressure and speed on sheet properties”, *Nordic Pulp & Paper Research Journal*, 1997 (temperaturas 120–177°C, cargas 175–350 kN/m, efeitos em brilho/lisura/caliper). DOI: 10.3183/npprj-1997-12-01-p013-018.
5. **Patente EP0627523A1** — “Gap former in a paper machine” (consistências típicas na formação: caixa 0,5–1,7%; após MB 7–12%). Disponível em: `https://patents.google.com/patent/EP0627523A1/en`.
6. **Patente EP0549553A1** — “Press section of a paper machine, in particular for printing paper qualities” (carga linear 10–120 kN/m, secura após prensa 25–33% e 48–54%). Disponível em: `http://data.epo.org/publication-server/rest/v1.2/patents/EP0549553NWA1/document.html`.
7. **Patente US5106029A** — “Method and apparatus for reel-up of a paper web” (carga linear de enrolamento 1–4 kN/m; pressão do rolo ~10 kN/m). Disponível em: `https://patents.google.com/patent/US5106029A/en`.
8. **Patente US5489365** — “Adjustable twin-wire former with suction boxes for simultaneous drainage in both directions” (vácuo de formação 0,3–3 m w.g., equivalente a 3–30 kPa). Disponível em: `https://www.sumobrain.com/patents/US5489365.html`.
9. **Valmet** — “Fresh, slightly superheated steam is supplied to the dryer groups” (pressões típicas em grupos de secagem para 1.200 m/min; Tabela 1). Disponível em: `https://new.valmet.com/globalassets/media/downloads/white-papers/drying-and-air-systems/wpd_steamcondensate.pdf`.
10. **TAPPI** — “Rotating and stationary siphons in high-speed dryer sections” (ΔP típico 12–15 psid para sifões rotativos em > 900 m/min; ~2 psi para sifões estacionários). Disponível em: `imisrise.tappi.org`.
11. **TAPPI** — “Machine Performance” (cálculo de eficiência, produto vendável, refugo). Disponível em: `imisrise.tappi.org`.
12. **Patente US5379528A** — “Paper making machine drying section steam pressure profile” (faixas de pressão de vapor por grupo). Disponível em: `https://patents.google.com/patent/US5379528A`.
13. **EPA** — “Paper machine white water use on wire cleaning showers” / “Save-all” (consistência típica da água branca 0,05–0,5%). Disponível em: `nepis.epa.gov`.
14. **TAPPI** — “Quality control system for paper, board and tissue machines” (medições QCS: gramatura, umidade, caliper, cinzas, cor). Disponível em: `en.wikipedia.org/wiki/Quality_control_system_for_paper,_board_and_tissue_machines` (artigo baseado em literatura TAPPI).
15. **Patente US5106029A** — “Method and apparatus for reel-up” (carga linear de enrolamento 1–4 kN/m).
16. **TAPPI** — “The limits of pressing” (secura após prensa, cargas de nip 12,4–13,8 MPa em prensa de rolo; ganhos de feltro 1,5–2%).
17. **Valmet** — “Steam & Condensate System Improvements” (controle de ΔP em dois estágios: orifício 20 kPa + válvula; blow-through 10–15%).
18. **Patente WO1998007950A1** — “Method and apparatus for executing grade change in paper machine” (rampas de vazão de massa e velocidade; tempo de grade change ~10–30 min; produto de transição vira broke). Disponível em: `https://patents.google.com/patent/WO1998007950A1`.
19. **TAPPI** — “Paper Machine Transition Troubleshooting from Stock Blending to the Reel” (recuperação de perfil após quebra/grade change; 5–10 eventos de grade change para diagnóstico). Disponível em: `library.e.abb.com`.
20. **ISO 20816-3** — *Mechanical vibration — Measurement and evaluation of machine vibration — Part 3: Industrial machinery with nominal power above 15 kW and nominal speeds between 120 r/min and 30.000 r/min*. Geneva: ISO, 2022. (Referência para limites de vibração em manutenção preditiva).