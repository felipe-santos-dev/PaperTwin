# Engenharia de Processo e Automação de uma Máquina de Papel de Imprimir e Escrever (UWF) — Especificação Técnica para Gêmeo Digital

Este documento consolida a modelagem fenomenológica (físico-química), a instrumentação industrial (padrão **ISA-5.1**), a estratégia de controle regulatório e multivariável (SDCD + QCS), a filosofia de gerenciamento de alarmes (**ANSI/ISA-18.2**) e os modos de falha de uma máquina moderna de papel de imprimir e escrever não revestido (*Uncoated Woodfree* — UWF, linha *cut-size* A4). Todo o conteúdo foi estruturado para alimentar diretamente o motor de simulação dinâmica e a camada de monitoramento preditivo de um **Gêmeo Digital**.

## Parâmetros de Projeto da Máquina de Referência

| Parâmetro de Projeto | Valor Nominal / Faixa Operacional | Base de Referência / Comentário Técnico |
| :--- | :--- | :--- |
| **Tipo de Produto** | Papel Imprimir e Escrever Não Revestido (UWF / *Cut-Size* Alcalino) | Matéria-prima fibrosa: 95–100% Celulose Kraft Branqueada de Eucalipto (BHKP) |
| **Faixa de Gramatura ($BW$)** | $70\text{ a }90\text{ g/m}^2$ (Alvo de referência: **$75,0\text{ g/m}^2$**) | Norma comercial ISO 536 / ABNT NBR NM ISO 536 |
| **Velocidade Operacional ($V_m$)** | $1.200\text{ a }1.300\text{ m/min}$ (Alvo: **$1.250\text{ m/min} = 20,83\text{ m/s}$**) | Velocidade de balanceamento mecânico de projeto: $1.500\text{ m/min}$ |
| **Largura Útil na Enroladeira ($W_{reel}$)** | **$8,00\text{ m}$** ($8.000\text{ mm}$ líquidos após refile) | Largura no lábio da caixa de entrada: $\sim 8,35\text{ m}$ (considerando refile úmido e encolhimento CD de $3,2\%$) |
| **Produção Bruta Instantânea ($\dot{m}_{bruta}$)** | **$45,0\text{ t/h}$** (a $75\text{ g/m}^2$, $1.250\text{ m/min}$, $8,0\text{ m}$) | Faixa de $40,3\text{ t/h}$ ($70\text{ g/m}^2$ a $1.200\text{ m/min}$) a $56,2\text{ t/h}$ ($90\text{ g/m}^2$ a $1.300\text{ m/min}$) |
| **Configuração Tecnológica** | Caixa de entrada hidráulica com diluição CD $\rightarrow$ *Gap Former* $\rightarrow$ Prensa Tri-Nip / 2 Sapatas $\rightarrow$ Pré-Secagem (*Single-Tier* + *Double-Tier*) $\rightarrow$ Scanner Pré-Colagem $\rightarrow$ *Film Press* (*SpeedSizer*) $\rightarrow$ Pós-Secagem $\rightarrow$ *Soft Calender* $\rightarrow$ Scanner Final QCS $\rightarrow$ Enroladeira *Pope* | Arquitetura equivalente às plataformas **Voith XcelLine** (*MasterJet Pro*, *DuoFormer D*, *Tandem NipcoFlex*, *SpeedSizer*, *NipcoMat*, *MasterReel*) e **Valmet OptiConcept M** (*OptiFlo*, *OptiFormer Gap*, *OptiPress*, *OptiSizer Film*, *OptiCalender Soft*, *OptiReel*) |
| **Arquitetura de Automação** | SDCD (ex.: ABB Ability System 800xA) + QCS (ex.: ABB Ability QCS 800xA / Honeywell Experion MX) + Acionamento Seccional (DTC) + Historiador (AVEVA PI System) | Integração OPC UA / Modbus TCP / Profibus DP / Profinet; resolução no historiador de $1\text{ s}$ para variáveis rápidas e por varredura (*scan*) para matrizes CD |

---

## 1. Preparação de Massa e Circuito Curto (*Stock Preparation & Short Circulation*)

### 1.1 Fundamentos Físico-Químicos e Funcionamento

A preparação de massa transforma a suspensão de celulose branqueada de fibra curta de eucalipto (**BHKP**, comprimento médio de fibra $0,7\text{–}0,9\text{ mm}$, parede celular espessa) e o refugo interno recuperado (*broke*) em uma suspensão quimicamente estabilizada e hidraulicamente homogênea:

1. **Refinação de Baixa Consistência ($3,8\text{–}4,5\%$):** Os refinadores de discos duplos operam aplicando pulsos mecânicos de compressão e cisalhamento quando os flocos de fibras atravessam as bordas das barras do rotor e do estator. O objetivo físico para papel *cut-size* de eucalipto é promover a **fibrilação externa** (desprendimento parcial das camadas S1/S2 da parede celular, aumentando a área superficial específica hidrodinâmica) e a **fibrilação interna** (delaminação da parede celular, tornando a fibra flexível e colapsável em fita), minimizando o corte de fibra. Isso eleva a drenabilidade Schopper-Riegler de $\sim 16\text{–}18\text{ }^\circ\text{SR}$ (polpa virgem não refinada) para **$26\text{–}30\text{ }^\circ\text{SR}$**, gerando pontes de hidrogênio interfibrilares ($\text{OH}\cdots\text{O}$) durante a consolidação na secagem. O controle rege-se pela **Potência Específica Líquida de Refinação ($SRE$)** e pela **Carga Específica de Borda ($SEL$ / *Specific Edge Load*)**:
   $$SRE = \frac{P_{total} - P_{vazio}}{\dot{m}_{fibra\_seca}} = \frac{P_{total} - P_{0}}{Q \cdot C_{massa} \cdot \rho} \quad [\text{kWh/t}]$$
   Para fibra curta de eucalipto em papel P&E, usa-se preenchimento de discos com ângulo de barra pequeno ($10^\circ\text{–}18^\circ$) e baixa intensidade $SEL \approx 0,6\text{–}1,1\text{ J/m}$ (evitando corte) com $SRE \approx 45\text{–}65\text{ kWh/t}$ (Fonte: *Paulapuro, Book 8; Valmet OptiFiner*; Confiança: Alta).
2. **Tanque de Mistura (*Blend Chest*) e Tanque de Máquina (*Machine Chest*):** No tanque de mistura, a polpa BHKP refinada ($80\text{–}88\%$ da receita fibrosa) é combinada com o refugo desagregado (*broke*, $12\text{–}20\%$). Como o *broke* já contém carga mineral ($\text{CaCO}_3$), amido e fibras previamente secas (fenômeno de *hornificação*, que reduz a capacidade de inchamento da fibra), variações bruscas na proporção de *broke* alteram o grau de refino global, o teor de cinzas e a retenção. Do tanque de mistura, a massa passa ao tanque de máquina (que opera com nível rigorosamente constante para garantir recalque estável na bomba de massa grossa), passa pelo controle final de consistência (ajustado para **$3,4\text{–}3,6\%$**) e atravessa a **Válvula de Gramatura (*Basis Weight Valve*)**.
3. **Química da Parte Úmida (*Wet-End Chemistry*) Alcalina:**
   - **Amido Catiônico de Massa ($5\text{–}10\text{ kg/t}$):** Cozido continuamente em *jet cooker* a vapor direto ($125\text{–}135\text{ }^\circ\text{C}$), adsorve-se eletrostaticamente às cargas aniônicas (grupos carboxila $-\text{COO}^-$) das fibras de celulose e finos, compensando a perda de resistência mecânica causada pelo elevado teor de carga mineral.
   - **Cola Interna Sintética — AKD (*Alkyl Ketene Dimer*) ou ASA ($1,0\text{–}2,0\text{ kg/t}$):** Confere hidrofobicidade controlada ao substrato antes de a folha entrar no *film press*. O AKD reage na seção de secagem com os grupos hidroxila da celulose formando ligações $\beta$-cetoéster covalentes e orientando cadeias hidrofóbicas de ácidos graxos para fora da superfície da fibra, controlando o ensaio $\text{Cobb}_{60}$ em $22\text{–}28\text{ g/m}^2$.
   - **Carbonato de Cálcio Precipitado — PCC ($180\text{–}240\text{ kg/t}$ adicionado para atingir $20\text{–}22\%$ de cinzas no papel):** Cristais sintéticos de hábito **escalenoédrico** (em roseta, tamanho médio $1,8\text{–}2,5\text{ }\mu\text{m}$). O PCC escalenoédrico cria microvazios internos que maximizam o coeficiente de dispersão de luz ($S$, elevando a opacidade e a alvura), aumenta o volume específico (*bulk*), melhora a drenagem e reduz o custo variável (substitui fibra por mineral e não retém água intrafibrilar). Em contrapartida, interfere nas ligações fibra-fibra, reduzindo tração e rigidez se não compensado por amido.
   - **Alvejante Óptico — OBA (*Optical Brightening Agent*, derivados dissulfonados/tetrassulfonados de estilbeno, $2\text{–}5\text{ kg/t}$):** Absorve radiação ultravioleta ($\sim 340\text{–}370\text{ nm}$) e reemite luz visível na faixa azul-violeta ($430\text{–}450\text{ nm}$), corrigindo o tom amarelado natural da celulose e elevando a Brancura CIE para $158\text{–}165$.
   - **Sistema de Retenção Dual / Micropartícula (CPAM $180\text{–}350\text{ g/t}$ + Bentonita ou Sílica Coloidal $1,5\text{–}3,0\text{ kg/t}$):** A poliacrilamida catiônica de alto peso molecular (CPAM) é adicionada antes do depurador pressurizado (*screen*) para formar pontes de floculação (*bridging*). O rotor do *screen* cisalha esses macroflocos; em seguida, a micropartícula aniônica (bentonita) é injetada após o *screen*, refloculando a suspensão em microflocos densos, porosos e uniformes, elevando a retenção sem prejudicar a formação.
4. **Circuito Curto (*Short Circulation*) — Diluição, Limpeza Centrífuga, Desaeração e Depuração:**
   A massa grossa ($3,5\%$) que sai da Válvula de Gramatura desce ao fundo do **Silo de Água Branca (*Wire Pit*)**, onde é diluída por água branca rica ($0,20\text{–}0,25\%$) drenada da mesa formadora, reduzindo a consistência para **$0,75\text{–}0,95\%$**. A primeira bomba de mistura impulsiona a suspensão pela bateria de **depuradores centrífugos (*hydrocyclones / cleaners*)** para remoção de contaminantes pesados (areia, grãos de calcário) e para o **vaso desaerador sob vácuo (*Deculator*)**. No *Deculator*, a suspensão é aspergida contra o domo mantido à pressão absoluta de saturação da água na temperatura do processo ($\sim 18\text{–}22\text{ kPa abs}$ a $50\text{ }^\circ\text{C}$). A fervura instantânea sob vácuo reduz o ar livre e ligado às fibras de $1,0\text{–}2,5\%$ para **$<0,05\%$ em volume**, evitando formação de espuma, *pinholes* (microfuros), perda de drenagem e cavitação. Do *Deculator*, a suspensão desce por coluna barométrica para a **Bomba de Mistura da Caixa de Entrada (*Headbox Fan Pump*)** — uma bomba centrífuga de dupla sucção com rotor de pás bipartidas e defasadas (pulsação residual de pressão $<0,05\text{ kPa}$ pico-a-pico) — e atravessa os **depuradores pressurizados de fendas (*Headbox Screens*, fendas de $0,15\text{–}0,20\text{ mm}$)** antes de entrar no coletor da caixa de entrada.

### 1.2 Tabela de Variáveis — Seção 1 (ISA-5.1)

| Nome da Variável | TAG ISA-5.1 | Unidade | Faixa Típica | Local de Medição | Instrumento | Freq. | Controlada? | MV (Atuador) | Fonte / Confiança |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Potência Específica Líquida de Refinação | `JIC-101` | $\text{kWh/t}$ | $35\text{–}85$ (Alvo: $55$) | Painel do motor + linha de recalque dos refinadores | Transdutor de potência ativa (`JT-101`) + cálculo de vazão seca no SDCD | $1\text{ Hz}$ | Sim | Motor de avanço/recuo de discos do refinador (`JZ-101`) | Paulapuro Book 8 / Valmet (Alta) |
| Grau de Refino Schopper-Riegler | `AIC-102` | $^\circ\text{SR}$ | $22\text{–}34$ (Alvo: $28$) | Saída do refinador (amostrador em linha) / Lab | Analisador automático de drenabilidade em linha + Lab ISO 5267-1 | $1/300\text{ Hz}$ | Sim | Setpoint de `JIC-101` (cascata) | ISO 5267-1 / Smook (Alta) |
| Nível do Tanque de Mistura (*Blend Chest*) | `LIC-103` | $\%$ | $40\text{–}85$ (Alvo: $65$) | Costado inferior do tanque de mistura | Transmissor de pressão hidrostática faceado (`LT-103`) | $1\text{ Hz}$ | Sim | Válvulas de celulose BHKP e *broke* em controle de razão | Smook Cap. 14 (Alta) |
| Consistência da Massa Grossa (*Thick Stock*) | `AIC-104` | $\%$ | $3,0\text{–}4,2$ (Alvo: $3,5$) | Recalque da bomba do tanque de máquina | Sensor de consistência micro-ondas ou lâmina (`AT-104`) | $2\text{ Hz}$ | Sim | Válvula de água de diluição na sucção da bomba (`AV-104`) | TAPPI TIP 0404 / BTG (Alta) |
| Vazão de Massa Grossa (*Thick Stock Flow*) | `FIC-105` | $\text{m}^3\text{/h}$ | $650\text{–}1.250$ (Alvo: $920$) | Linha entre *Machine Chest* e Silo | Medidor eletromagnético de alta exatidão (`FT-105`) | $10\text{ Hz}$ | Sim | Válvula de Gramatura (*Basis Weight Valve* `FV-105`) | ABB QCS / Honeywell (Alta) |
| Dosagem de Carga Mineral (PCC) | `FIC-106` | $\text{kg/t}$ | $150\text{–}260$ (Alvo: $210$) | Linha de injeção antes da *fan pump* | Medidor mássico Coriolis (`FT-106`) | $1\text{ Hz}$ | Sim | Bomba dosadora / válvula (`FV-106`) em cascata com cinzas QCS | Paulapuro Book 4 (Alta) |
| Dosagem de Cola Interna (AKD / ASA) | `FIC-107` | $\text{kg/t}$ | $0,8\text{–}2,5$ (Alvo: $1,4$) | Entrada da *fan pump* / massa grossa | Medidor Coriolis ou magnético sanitário (`FT-107`) | $1\text{ Hz}$ | Sim | Inversor da bomba dosadora volumétrica (`FZ-107`) | Paulapuro Book 4 (Alta) |
| Dosagem de Amido Catiônico na Massa | `FIC-108` | $\text{kg/t}$ | $4,0\text{–}12,0$ (Alvo: $7,5$) | Massa grossa antes do silo | Medidor eletromagnético (`FT-108`) | $1\text{ Hz}$ | Sim | Bomba de cavidade progressiva com VFD (`FZ-108`) | Paulapuro Book 4 (Alta) |
| Dosagem de Polímero de Retenção (CPAM) | `FIC-109` | $\text{g/t}$ | $150\text{–}450$ (Alvo: $250$) | Entrada do depurador pressurizado (*screen*) | Medidor eletromagnético (`FT-109`) | $1\text{ Hz}$ | Sim | Bomba dosadora em cascata com consistência da água branca (`AIC-306`) | Paulapuro Book 4 / Kemira (Alta) |
| Dosagem de Alvejante Óptico (OBA) | `FIC-110` | $\text{kg/t}$ | $1,5\text{–}6,0$ (Alvo: $3,5$) | Massa grossa e preparação de amido | Medidor eletromagnético (`FT-110`) | $1\text{ Hz}$ | Sim | Bomba dosadora em cascata com Brancura CIE no QCS (`AIC-906`) | TAPPI T 452 / ABB QCS (Alta) |
| Pressão Absoluta do *Deculator* | `PIC-111` | $\text{kPa abs}$ | $15\text{–}28$ (Alvo: $20$) | Domo superior do vaso desaerador | Transmissor de pressão absoluta (`PT-111`) | $2\text{ Hz}$ | Sim | Válvula de controle de vácuo do *Deculator* (`PV-111`) | Voith / Andritz (Alta) |
| Nível de Transbordo do *Deculator* | `LIC-112` | $\%$ | $45\text{–}65$ (Alvo: $55$) | Compartimento de aceite e vertedouro do *Deculator* | Transmissor diferencial de nível (`LT-112`) | $2\text{ Hz}$ | Sim | Rotação da bomba primária dos *cleaners* (VFD) | Paulapuro Book 8 (Alta) |
| Pressão Diferencial do *Screen* da Caixa | `PDIC-113` | $\text{kPa}$ | $10\text{–}35$ (Alvo: $18$) | Entrada vs. aceite do depurador pressurizado | Transmissor de pressão diferencial (`PDT-113`) | $2\text{ Hz}$ | Sim | Válvula de vazão de rejeito do *screen* (`PDV-113`) | Valmet OptiScreen (Alta) |
| Rotação da *Fan Pump* da Caixa de Entrada | `SIC-114` | $\text{rpm}$ | $450\text{–}850$ (Alvo: $680$) | Eixo do motor de média tensão da *Fan Pump* | Encoder incremental + inversor de média tensão (`ST-114`) | $20\text{ Hz}$ | Sim | Inversor VFD comandado pela pressão total da caixa (`PIC-201`) | Voith / Valmet (Alta) |

### 1.3 Malhas de Controle Principais e Acoplamentos

- **Controle de Vazão de Fibra Seca (*Dry Stock Flow Control*):** O controlador de gramatura seca do QCS (`AIC-902`) não posiciona diretamente a válvula de gramatura (`FV-105`); ele envia um setpoint de **vazão mássica seca ($\text{t/h}$)** para um bloco multiplicador no SDCD que divide essa demanda pela consistência medida (`AIC-104`), gerando o setpoint volumétrico (`FIC-105`). Assim, se a consistência na linha cair repentinamente de $3,50\%$ para $3,40\%$ devido a uma perturbação de diluição, o bloco *feedforward* abre imediatamente a válvula `FV-105` em $+2,94\%$ **antes** que o erro viaje pelo circuito curto e pela máquina (atraso de transporte $\theta_d \approx 65\text{–}90\text{ s}$ até o scanner final).
- **Acoplamento Cinzas $\times$ Gramatura $\times$ Retenção:** Um aumento na dosagem de PCC (`FIC-106`) aumenta o teor de cinzas (`AIC-904`), mas também eleva a gramatura seca total (`AIC-902`). O controlador multivariável (MPC) do QCS desacopla as malhas: quando sobe `FIC-106` em $+10\text{ kg/t}$, reduz simultaneamente o setpoint de vazão de massa fibrosa (`FIC-105`) na mesma proporção mássica retida para manter a gramatura constante em $75,0\text{ g/m}^2$.

### 1.4 Alarmes Típicos e Limites (Padrão ISA-18.2)

- **`AIC-104` (Consistência da Massa Grossa):** `L = 3,2%` (Prioridade Média), `H = 3,8%` (Média), `LL = 2,9%` / `HH = 4,1%` (Prioridade Alta — risco de saturação da válvula de diluição `AV-104` e oscilação severa de gramatura MD; *deadband* $0,05\%$, atraso $5\text{ s}$).
- **`PDIC-113` ($\Delta P$ do Depurador Pressurizado):** `H = 28 kPa` (Prioridade Alta — início de colmatação da cesta de fendas), `HH = 35 kPa` (Prioridade Crítica/Emergência — dispara manobra automática de abertura de purga de rejeito para evitar colapso mecânico da cesta do *screen*).
- **`PIC-111` (Pressão Absoluta do *Deculator*):** `H = 25 kPa abs` (Prioridade Alta — perda de fervura sob vácuo; entrada de ar livre na caixa de entrada).

### 1.5 Falhas e Anormalidades Comuns

| Anormalidade / Falha | Sintoma Observado no Processo | Causa Provável | Variáveis Precursoras no Gêmeo Digital |
| :--- | :--- | :--- | :--- |
| **Válvula de diluição de consistência em fim de curso** | Oscilação cíclica da gramatura MD na enroladeira com período de $30\text{–}60\text{ s}$ | Consistência no *Machine Chest* caiu abaixo de $3,5\%$ ou pressão de água branca caiu, levando `AV-104` a $0\%$ ou $100\%$ | Saída do controlador `AIC-104.OP` $< 5\%$ ou $> 95\%$ por mais de $30\text{ s}$ |
| **Entupimento progressivo da cesta do *Headbox Screen*** | Queda de pressão na caixa de entrada e aumento de rejeitos fibrosos | Formação de *stickies*, fiapos (*strings*) ou precipitação de carbonato/amido na cesta | Subida monotônica de `PDIC-113` ($> 25\text{ kPa}$) acompanhada de aumento da corrente do motor do rotor do *screen* |
| **Hidrolisação da emulsão de AKD** | Queda na retenção, espuma no silo, depósitos escorregadios na tela e perda de colagem ($\text{Cobb}_{60} > 32\text{ g/m}^2$) | Temperatura excessiva no circuito curto ($> 55\text{ }^\circ\text{C}$), pH $> 8,5$ ou tempo de estocagem longo da emulsão | Aumento da dosagem de CPAM (`FIC-109`) exigido para manter `AIC-306` e subida do ensaio `LAB-1211` (Cobb) |

---

## 2. Caixa de Entrada (*Hydraulic Headbox with Dilution Control*)

### 2.1 Fundamentos Físico-Químicos e Funcionamento

A caixa de entrada hidráulica converte a vazão em tubulação cilíndrica ($\sim 1,2\text{ m}$ de diâmetro, vazão $\sim 65.000\text{ a }85.000\text{ L/min}$) em um jato retangular livre, plano e altamente uniforme com $\sim 8,35\text{ m}$ de largura e $10\text{–}13\text{ mm}$ de espessura:

1. **Coletor Cônico (*Tapered Header*) e Recirculação:** A suspensão entra lateralmente em um distribuidor de seção decrescente. Cerca de **$6\text{–}10\%$ da vazão de entrada** é recirculada na extremidade oposta (`FIC-206`) para equalizar a pressão estática transversal (CD) entre o lado de entrada (Lado Acionamento — TS) e o lado oposto (Lado Operador — DS).
2. **Controle de Perfil CD por Água de Diluição (*Dilution Water Profiling*):** Na entrada de cada fileira do banco de tubos (*tube bank*), válvulas motorizadas individuais (120 a 160 zonas espaçadas de $50\text{ a }65\text{ mm}$, ex.: *Voith ModuleJet* ou *Valmet IQ Dilution*) injetam água branca clarificada (filtrada e desaerada, consistência $\sim 0,05\text{–}0,15\%$). Ao contrário do método antigo de deformar mecanicamente a régua do lábio (*slice lip bending*), que gerava fluxos cruzados laterais e alterava o ângulo de orientação das fibras, a diluição altera **localmente a consistência** em cada zona mantendo a vazão volumétrica e a velocidade do jato constantes ao longo de toda a largura da máquina.
3. **Gerador de Turbulência e Convergência do Lábio (*Slice Nozzle*):** A suspensão atravessa canais escalonados com expansão abrupta (difusores de passo), criando microturbulência de alta intensidade e pequena escala (escala de Kolmogorov compatível com o comprimento da fibra, $\sim 1\text{–}3\text{ mm}$) que dispersa os flocos de fibras. Na saída da régua do lábio (*slice*), a energia potencial de pressão converte-se em energia cinética segundo a equação de Bernoulli modificada:
   $$V_{jato} = C_v \sqrt{2 \cdot g \cdot H_{total}} = C_v \sqrt{\frac{2 \cdot P_{caixa}}{\rho_{suspensao}}}$$
   onde $P_{caixa}$ é a pressão manométrica total na câmara antes do lábio (`PIC-201`), $\rho_{suspensao} \approx 995\text{ kg/m}^3$ (a $50\text{ }^\circ\text{C}$), e $C_v \approx 0,97\text{–}0,99$ é o coeficiente de velocidade do bocal. Para $V_{jato} = 1.262\text{ m/min}$ ($21,04\text{ m/s}$), a pressão requerida é:
   $$P_{caixa} = \frac{\rho_{suspensao} \cdot V_{jato}^2}{2 \cdot C_v^2} \approx \frac{995 \cdot (21,04)^2}{2 \cdot (0,98)^2} \approx 229,3\text{ kPa} \quad (\approx 23,4\text{ m.c.a.})$$
   *(Nota de modelagem física: como $P_{caixa} \propto V_{jato}^2$, em máquinas lentas a $600\text{ m/min}$ a pressão opera em $\sim 50\text{ kPa}$, enquanto a $1.200\text{–}1.300\text{ m/min}$ opera na faixa de **$195\text{ a }255\text{ kPa}$**, ou $20\text{ a }26\text{ m.c.a.}$).*
4. **Relação Jato/Tela (*Jet-to-Wire Ratio*, $R_{J/W}$):**
   $$R_{J/W} = \frac{V_{jato}}{V_{tela}}$$
   - Quando $R_{J/W} = 1,00$ (ponto de mínimo cisalhamento hidrodinâmico), as fibras depositam-se da forma mais isotrópica possível (menor razão de tração MD/CD, tipicamente $\sim 1,7\text{–}1,9$, mas com maior tendência à floculação no impacto).
   - Quando $R_{J/W} > 1,00$ (*rush*, tipicamente **$1,01\text{ a }1,03$**) ou $R_{J/W} < 1,00$ (*drag*, tipicamente $0,97\text{ a }0,99$), o diferencial de velocidade $\Delta V = |V_{jato} - V_{tela}|$ cria uma tensão de cisalhamento no impacto que alinha as fibras na direção da máquina (MD), aumentando a razão de tração MD/CD para $2,1\text{–}2,4$ e melhorando a formação por cisalhamento de flocos.

### 2.2 Tabela de Variáveis — Seção 2 (ISA-5.1)

| Nome da Variável | TAG ISA-5.1 | Unidade | Faixa Típica | Local de Medição | Instrumento | Freq. | Controlada? | MV (Atuador) | Fonte / Confiança |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Pressão Total da Caixa de Entrada | `PIC-201` | $\text{kPa}$ | $195\text{–}255$ (Alvo: $225$ a $1.250\text{ m/min}$) | Câmara convergente antes do lábio | Transmissor de pressão de alta exatidão $0,04\%$ FS (`PT-201`) | $20\text{ Hz}$ | Sim | Rotação da *Fan Pump* (`SIC-114`) e válvula de *by-pass* | Paulapuro Book 8 / Voith (Alta) |
| Relação Jato/Tela (*Jet-to-Wire Ratio*) | `XHIC-202` | adim. | $0,96\text{–}1,05$ (Alvo: $1,015$) | Calculado no SDCD (`PIC-201` e `SI-301`) | Bloco de cálculo bernoulliano em tempo real | $10\text{ Hz}$ | Sim | Setpoint de `PIC-201` em cascata | TAPPI TIP 0404-47 (Alta) |
| Consistência na Caixa de Entrada | `AI-203` | $\%$ | $0,65\text{–}1,10$ (Alvo: $0,85$) | Coletor de alimentação / recirculação | Sensor óptico de baixa consistência + Lab | $1\text{ Hz}$ | Não | Ajustada via abertura média do lábio (`ZIC-204`) | Voith MasterJet / Valmet (Alta) |
| Abertura Média do Lábio (*Slice Opening*) | `ZIC-204` | $\text{mm}$ | $8,0\text{–}16,0$ (Alvo: $11,5$) | Viga superior do lábio (*slice*) | Transdutores LVDT / encoders absolutos | $1\text{ Hz}$ | Sim | Atuadores motorizados de elevação do lábio | Voith / Valmet (Alta) |
| Posição das Válvulas de Diluição CD | `ZIC-205` | $\%$ | $15\text{–}85$ (Alvo médio: $50$) | $120\text{–}160$ zonas no distribuidor da caixa | Atuadores de passo inteligentes (*ModuleJet* / *IQ Dilution*) | $1\text{ Hz}$ | Sim | Motores de passo comandados pelo controle CD de gramatura do QCS | ABB QCS / Voith (Alta) |
| $\Delta P$ do Coletor de Água de Diluição | `PDIC-206` | $\text{kPa}$ | $15\text{–}45$ (Alvo: $25$) | Coletor de água de diluição vs. coletor de massa | Transmissor de pressão diferencial (`PDT-206`) | $2\text{ Hz}$ | Sim | VFD da bomba de água branca de diluição | Valmet OptiFlo (Alta) |

### 2.3 Malhas de Controle Principais e Acoplamentos

- **Malha de Relação Jato/Tela (`XHIC-202` $\rightarrow$ `PIC-201` $\rightarrow$ `SIC-114`):** Sempre que a velocidade da máquina ($V_{tela}$) é alterada pelo operador ou pela otimização automática de velocidade, o setpoint de pressão da caixa (`PIC-201`) é recalculado instantaneamente de forma quadrática ($P_{SP} \propto (R_{J/W} \cdot V_{tela})^2$) para manter $R_{J/W}$ cravado em $1,015$.
- **Acoplamento Abertura do Lábio (`ZIC-204`) $\times$ Velocidade do Jato (`PIC-201`) $\times$ Consistência (`AI-203`):** Se o operador abrir o lábio médio de $11,5\text{ mm}$ para $12,5\text{ mm}$ para melhorar a formação, a pressão na caixa tenderia a cair. O controlador `PIC-201` acelera a *Fan Pump* (`SIC-114`) para restaurar a pressão; como entra mais água branca do silo para a mesma vazão de massa grossa (`FIC-105`), a consistência na caixa de entrada (`AI-203`) cai de $0,85\%$ para $\sim 0,78\%$.

### 2.4 Alarmes Típicos e Limites (ISA-18.2)

- **`XHIC-202` (Relação Jato/Tela):** `L = 0,97`, `H = 1,04` (Prioridade Alta); `LL = 0,94` / `HH = 1,06` (Prioridade Crítica — desestabilização hidrodinâmica da formação e risco imediato de quebra na mesa/prensa).
- **`PDIC-206` ($\Delta P$ do Coletor de Diluição):** `LL = 10 kPa` (Prioridade Alta — risco de refluxo de fibras da câmara principal para dentro das linhas de água clarificada de diluição, entupindo os atuadores CD).

### 2.5 Falhas e Anormalidades Comuns

| Anormalidade / Falha | Sintoma Observado no Processo | Causa Provável | Variáveis Precursoras no Gêmeo Digital |
| :--- | :--- | :--- | :--- |
| **Entupimento ou travamento de válvula de diluição CD** | Raia fixa de alta ou baixa gramatura seca no perfil CD do QCS | Incrustação de carbonato/limo ou perda de passos do motor da zona $k$ | Divergência persistente entre comando `ZIC-205[k].OP` e erro local de gramatura na zona mapeada $k$, além de saturação de zonas vizinhas ($k-1, k+1$) tentando compensar |
| **Estrias no jato (*Jet Streaks*)** | Riscos longitudinais visíveis na mesa e variação localizada de formação | Fibra presa ou depósito biológico na borda da régua do lábio (*slice lip*) ou em tubo do banco | Aumento do índice de variância residual CD de curta escala no scanner QCS |

---

## 3. Seção de Formação (*Gap Former*)

### 3.1 Fundamentos Físico-Químicos e Funcionamento

Em velocidades de $1.200\text{–}1.300\text{ m/min}$, uma mesa plana convencional (*Fourdrinier*) sofreria instabilidade da superfície livre (salto de jato e *spouting*). Por isso, máquinas modernas de P&E utilizam um **Formador de Duas Telas (*Gap Former*)** — como *Voith DuoFormer D* ou *Valmet OptiFormer Gap*:

1. **Cunha de Entrada e Rolo Formador (*Forming Roll*):** O jato livre da caixa de entrada é injetado diretamente na cunha convergente entre duas telas sintéticas de poliéster multi-camadas (tela interna/inferior e tela externa/superior) que envolvem o **Rolo Formador** de camisa perfurada sob vácuo (`PIC-301`). A pressão de drenagem inicial $P_{dren}$ no contorno curvo do rolo de raio $R$ sob tensão da tela externa $T$ é governada pela **Equação de Laplace-Young para telas tensionadas**:
   $$P_{dren} = \frac{T_{tela}}{R_{rolo}} \quad [\text{kPa}]$$
   Para $T_{tela} = 7,8\text{ kN/m}$ e um rolo formador de diâmetro $1,60\text{ m}$ ($R = 0,80\text{ m}$), gera-se uma pressão hidrodinâmica suave e contínua de **$P_{dren} \approx 9,75\text{ kPa}$**, promovendo drenagem simétrica para ambos os lados (~50% da água drena pela tela superior e ~50% pela inferior). Isso evita a assimetria estrutural (*two-sidedness*) de finos e PCC entre o lado topo e o lado tela.
2. **Caixa de Formação de Lâminas Carregáveis (*Forming Shoe & Loadable Blades*):** Após o rolo formador, o sanduíche tela-massa-tela passa sobre uma sapata curva de lâminas cerâmicas no lado inferior e lâminas opostas carregadas pneumaticamente (`PIC-302`, $2\text{–}25\text{ kPa}$) no lado superior. Cada passagem sobre uma lâmina gera um pulso positivo de pressão (que cisalha flocos e redistribui fibras) seguido de um pulso de vácuo na divergência (que drena água). Ajustar a pressão de `PIC-302` permite ao operador arbitrar em tempo real o **compromisso Formação vs. Retenção**: maior pressão nas lâminas melhora o índice de formação (quebra flocos), mas reduz a retenção de primeira passagem de finos e PCC.
3. **Caixas de Baixo Vácuo (*Wet Boxes*), Alto Vácuo (*Flat Boxes*) e Rolo de Sucção (*Couch Roll*):** Após a separação da tela superior, a folha segue sobre a tela inferior passando pelas caixas úmidas de baixo vácuo (`PIC-303`, $-10\text{ a }-30\text{ kPa}$), onde a consistência sobe de $\sim 3\%$ para $\sim 8\%$, pelas caixas planas de alto vácuo (`PIC-304`, $-30\text{ a }-55\text{ kPa}$), onde o ar começa a atravessar os poros da folha deslocando água livre (consistência chega a $14\text{–}16\%$), e finalmente pelo **Rolo de Sucção (*Couch Roll*)** com zona de alto vácuo (`PIC-305`, $-55\text{ a }-75\text{ kPa}$), entregando a folha na transferência (*pick-up*) para a seção de prensas com **sequidade de $18\text{ a }22\%$**.
4. **Retenção de Primeira Passagem (*First-Pass Retention* — FPR) e Retenção de Cinzas (FPAR):**
   $$\text{FPR (\%)} = \left(1 - \frac{C_{agua\_branca}}{C_{caixa\_entrada}}\right) \times 100$$
   Com $C_{caixa\_entrada} = 0,85\%$ e $C_{agua\_branca} = 0,21\%$ (`AIC-306`), obtém-se **$\text{FPR} \approx 75,3\%$** (faixa típica $72\text{–}82\%$, enquanto a retenção de cinzas $\text{FPAR}$ situa-se em $50\text{–}65\%$).

### 3.2 Tabela de Variáveis — Seção 3 (ISA-5.1)

| Nome da Variável | TAG ISA-5.1 | Unidade | Faixa Típica | Local de Medição | Instrumento | Freq. | Controlada? | MV (Atuador) | Fonte / Confiança |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Vácuo no Rolo Formador (*Forming Roll*) | `PIC-301` | $\text{kPa}$ | $-5\text{ a }-25$ (Alvo: $-15$) | Caixa interna de sucção do rolo formador | Transmissor de vácuo (`PT-301`) | $2\text{ Hz}$ | Sim | Válvula borboleta de vácuo (`PV-301`) | Paulapuro Book 8 / Voith (Alta) |
| Pressão de Carga das Lâminas Formadoras | `PIC-302` | $\text{kPa}$ | $2\text{–}25$ (Alvo: $12$) | Mangueiras pneumáticas das lâminas opostas | Transmissor de pressão (`PT-302`) | $1\text{ Hz}$ | Sim | Reguladores eletropneumáticos (`PV-302`) | Valmet OptiFormer / Voith (Alta) |
| Vácuo nas Caixas Úmidas (*Wet Boxes*) | `PIC-303` | $\text{kPa}$ | $-10\text{ a }-30$ (Alvo: $-20$) | Coletores das caixas de baixo vácuo | Transmissor de vácuo (`PT-303`) | $1\text{ Hz}$ | Sim | Válvula de controle de vácuo (`PV-303`) | TAPPI TIP 0404-27 (Alta) |
| Vácuo nas Caixas de Alto Vácuo (*Flat Boxes*) | `PIC-304` | $\text{kPa}$ | $-30\text{ a }-55$ (Alvo: $-42$) | Caixas de sucção antes do *couch* | Transmissor de vácuo (`PT-304`) | $1\text{ Hz}$ | Sim | Válvulas de vácuo escalonadas (`PV-304`) | TAPPI TIP 0404-27 (Alta) |
| Vácuo na Zona Alta do Rolo *Couch* | `PIC-305` | $\text{kPa}$ | $-55\text{ a }-75$ (Alvo: $-65$) | Caixa interna de alto vácuo do *Couch* | Transmissor de vácuo (`PT-305`) | $2\text{ Hz}$ | Sim | Válvula principal / rotação do turbo *blower* (`PV-305`) | Paulapuro Book 8 / Runtech (Alta) |
| Consistência da Água Branca (*WWC*) | `AIC-306` | $\%$ | $0,12\text{–}0,35$ (Alvo: $0,22$) | Calha de água branca para o silo | Analisador óptico de sólidos e cinzas (`AT-306`) | $1/15\text{ Hz}$ | Sim | Vazão de polímero de retenção CPAM (`FIC-109`) | Valmet WWC / BTG (Alta) |
| Tensão das Telas Formadoras | `TIC-307` | $\text{kN/m}$ | $6,0\text{–}10,0$ (Alvo: $7,8$) | Mancais do rolo medidor de tensão | Células de carga nos lados TS e DS (`TT-307`) | $5\text{ Hz}$ | Sim | Cilindro do rolo esticador da tela (`TZ-307`) | Voith / Valmet Fabrics (Alta) |

### 3.3 Malhas de Controle Principais e Acoplamentos

- **Malha de Controle de Consistência de Água Branca (`AIC-306` $\rightarrow$ `FIC-109`):** Estabiliza a retenção química do circuito curto ajustando automaticamente a dosagem de CPAM. Se a proporção de *broke* aumentar ou o grau de refino subir, a carga de finos aumenta e `AIC-306` começa a subir; o controlador aumenta `FIC-109` mantendo a água branca em $0,22\%$, evitando oscilações de longo prazo na gramatura e nas cinzas.
- **Acoplamento Grau de Refino (`AIC-102`) $\times$ Vácuo do *Couch* (`PIC-305`) $\times$ Potência de Acionamento da Mesa:** Maior refino ($^\circ\text{SR}$) fecha os poros da manta fibrosa, elevando o vácuo no rolo *couch* e nas caixas planas, o que aumenta o atrito das telas sobre as réguas cerâmicas e eleva a corrente dos motores seccionais da seção de formação.

### 3.4 Alarmes Típicos e Limites (ISA-18.2)

- **`PIC-305` (Vácuo do Rolo *Couch*):** `LL = -45 kPa` (Prioridade Crítica — perda de vácuo na saída da mesa reduz a sequidade abaixo de $17\%$, provocando queda da resistência úmida e quebra imediata na transferência para a prensa).
- **`TIC-307` (Tensão da Tela Formadora):** `LL = 5,0 kN/m` (Prioridade Crítica — escorregamento da tela sobre o rolo acionador e perda de pressão de drenagem no rolo formador).

### 3.5 Falhas e Anormalidades Comuns

| Anormalidade / Falha | Sintoma Observado no Processo | Causa Provável | Variáveis Precursoras no Gêmeo Digital |
| :--- | :--- | :--- | :--- |
| **Selamento da folha (*Sheet Sealing*)** | Água livre sobre a tela na entrada das caixas planas, queda de sequidade no *couch* e esmagamento na prensa | Vácuo excessivo logo nas primeiras caixas úmidas (`PIC-303`) puxando finos e PCC para a face da tela e impermeabilizando a base | Aumento do vácuo nas primeiras caixas úmidas acompanhado de queda de vazão de água extraída nas caixas seguintes e queda de vácuo no *couch* |
| **Sobredosagem de polímero de retenção (Superfloculação)** | Formação nublada ("papel chuvoso" com macroflocos), perda de opacidade e porosidade alta | Excesso de CPAM (`FIC-109` $> 400\text{ g/t}$) | Queda anormal de `AIC-306` ($< 0,14\%$) combinada com deterioração do índice de formação no scanner QCS |

---

## 4. Seção de Prensas (*Shoe Press Section*)

### 4.1 Fundamentos Físico-Químicos e Funcionamento

Remover $1\text{ kg}$ de água mecanicamente nas prensas consome cerca de **$20\text{ a }25\text{ vezes menos energia}$** do que evaporá-lo termicamente na seção de secagem. Além disso, a prensagem consolida a folha aproximando as fibras a distâncias moleculares para formação das ligações de hidrogênio.

1. **Prensa de Sapata (*Shoe Press*, ex.: *Voith Tandem NipcoFlex* ou *Valmet SymPress B*):** Substitui o nip curto de dois cilindros rígidos (comprimento de nip $L_{nip} \approx 35\text{–}50\text{ mm}$, tempo de residência $\sim 2\text{ ms}$) por uma sapata estacionária côncava carregada hidraulicamente contra um rolo de contra-prensa envolvida por uma camisa impermeável de poliuretano ranurada (*press sleeve*). A sapata tem largura de **$L_{nip} \approx 250\text{ mm}$**, proporcionando a $1.250\text{ m/min}$ ($20,83\text{ m/s}$) um tempo de permanência de **$t_{nip} = \frac{0,250}{20,83} = 12,0\text{ ms}$** e um **Impulso de Prensagem ($I_p$)** elevado com pressão de pico moderada ($P_{max} \approx 4,5\text{–}6,0\text{ MPa}$):
   $$I_p = \int_{0}^{t_{nip}} P(t)\,dt = \frac{\text{Carga Linear } (W)}{V_{maquina}} \quad [\text{kPa}\cdot\text{s}]$$
   Para uma carga linear $W = 900\text{ kN/m}$ (`WIC-401`) e $V_m = 20,83\text{ m/s}$, o impulso de prensagem é **$I_p = \frac{900}{20,83} = 43,2\text{ kPa}\cdot\text{s}$**. O perfil de pressão ao longo da sapata cresce suavemente na entrada (evitando o esmagamento hidrodinâmico da folha — *crushing*) e cai abruptamente na saída (minimizando a reidratação capilar da folha pelo feltro — *rewetting*).
2. **Controle de Temperatura pela Caixa de Vapor (*Press Steam Box*):** Uma caixa de vapor seccionada em $50\text{–}80$ zonas CD (`PIC-403`) injeta vapor saturado de baixa pressão sobre a folha suportada por vácuo antes do nip principal, elevando a temperatura da folha de $\sim 48\text{ }^\circ\text{C}$ para **$58\text{–}62\text{ }^\circ\text{C}$**. A redução da viscosidade dinâmica da água ($\mu_{agua}$ cai de $0,56\text{ mPa}\cdot\text{s}$ a $48\text{ }^\circ\text{C}$ para $0,45\text{ mPa}\cdot\text{s}$ a $62\text{ }^\circ\text{C}$, segundo a lei de Darcy $q \propto \frac{k \cdot \Delta P}{\mu}$) e o amolecimento térmico da hemicelulose aumentam a sequidade de saída da prensa em **$+1,0\text{ a }+1,8\%$**, além de permitir correção fina do perfil CD de umidade antes do *film press*.
3. **Feltros Prensadores e Condicionamento Contínuo:** Os feltros de poliamida (gramatura $1.100\text{–}1.400\text{ g/m}^2$) recebem a água expulsa do papel no nip. Para não saturarem nem entupirem com PCC, finos e dímeros de AKD, cada feltro passa no seu retorno por **chuveiros lubrificantes**, **chuveiros oscilantes de alta pressão** (`PIC-405`, $14\text{–}20\text{ bar}$ com jatos agulha de $1,0\text{ mm}$) e **Caixas de Sucção *Uhle*** (`PIC-404`, $-40\text{ a }-60\text{ kPa}$).
4. **Passe Aberto ou Transferência Fechada e Estiramento (*Draw*):** A folha deixa a última prensa com **sequidade de $49\text{ a }53\%$** (`AI-407`). Ao descolar do rolo central liso (cerâmico/polimérico), existe um diferencial de velocidade controlada (**Estiramento / *Draw*** `SDIC-406` de **$1,5\text{ a }2,8\%$**) entre a prensa e o 1º grupo de secagem para vencer o trabalho de adesão superficial ($W_{adesao}$) conforme a equação de equilíbrio de descascamento (*peeling*):
   $$T_{folha} = \frac{W_{adesao}}{1 - \cos\phi} + m_{umida} \cdot V_{maquina}^2$$
   onde $\phi$ é o ângulo de saída da folha e $m_{umida} V_m^2$ é o termo centrífugo/inercial, muito relevante a $1.250\text{ m/min}$.

### 4.2 Tabela de Variáveis — Seção 4 (ISA-5.1)

| Nome da Variável | TAG ISA-5.1 | Unidade | Faixa Típica | Local de Medição | Instrumento | Freq. | Controlada? | MV (Atuador) | Fonte / Confiança |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Carga Linear da Prensa de Sapata | `WIC-401` | $\text{kN/m}$ | $600\text{–}1.100$ (Alvo: $900$) | Cilindros hidráulicos da sapata côncava | Transmissores de pressão hidráulica (`PT-401`) | $5\text{ Hz}$ | Sim | Válvulas proporcionais hidráulicas (`WV-401`) | Voith NipcoFlex / Valmet (Alta) |
| Pressão por Zona de Abaulado (*Crown*) | `PIC-402` | $\text{bar}$ | $15\text{–}90$ (Alvo: $55$) | Zonas hidrostáticas internas CD | Transmissores de pressão por zona (`PT-402`) | $2\text{ Hz}$ | Sim | Bloco de válvulas proporcionais multi-zona | Voith Nipco / Valmet (Alta) |
| Pressão e Zonas da Caixa de Vapor | `PIC-403` | $\text{kPa}$ / $\%$ | $5\text{–}45\text{ kPa}$ (Alvo: $20$) | Caixa de vapor sobre rolo de sucção | Transmissor de pressão + válvulas CD | $1\text{ Hz}$ | Sim | Válvula global + atuadores CD comandados por `AIC-901` | Honeywell / Valmet IQ (Alta) |
| Vácuo nas Caixas *Uhle* dos Feltros | `PIC-404` | $\text{kPa}$ | $-35\text{ a }-65$ (Alvo: $-50$) | Caixas *Uhle* no retorno de cada feltro | Transmissor de vácuo (`PT-404`) | $1\text{ Hz}$ | Sim | Válvula borboleta de vácuo (`PV-404`) | TAPPI TIP 0404-27 (Alta) |
| Pressão dos Chuveiros AP dos Feltros | `PIC-405` | $\text{bar}$ | $12\text{–}22$ (Alvo: $16$) | Coletor dos chuveiros agulha oscilantes | Transmissor de pressão + sensor de movimento | $1\text{ Hz}$ | Sim | Bomba AP com VFD (intertravada com oscilador) | Voith / Valmet Manuals (Alta) |
| Estiramento (*Draw*) Prensa $\rightarrow$ 1ª Secagem | `SDIC-406` | $\%$ | $1,2\text{–}3,2$ (Alvo: $2,1$) | Acionamento do rolo central vs. 1º grupo secador | Encoders digitais dos motores seccionais | $50\text{ Hz}$ | Sim | Referência de velocidade do acionamento seccional | ABB Sectional Drives (Alta) |
| Sequidade na Saída da Prensa | `AI-407` | $\%$ | $48,0\text{–}54,0$ (Alvo: $51,0$) | Saída do último nip antes do 1º secador | Sensor IR pontual/varredura ou Lab ISO 287 | Contínuo | Não | Ajustada via `WIC-401` e `PIC-403` | Paulapuro Book 8 (Alta) |

### 4.3 Malhas de Controle Principais e Acoplamentos

- **Controle CD de Umidade Pré-Colagem via Caixa de Vapor e Zonas da Prensa:** O perfil CD de umidade lido no scanner antes do *film press* (`AIC-901`) atua em duas escalas espaciais: a **Caixa de Vapor da Prensa (`PIC-403`)** corrige desvios estreitos de alta frequência espacial ($50\text{–}150\text{ mm}$), enquanto as **Zonas Hidrostáticas da Prensa (`PIC-402`)** corrigem tendências largas (sorriso/coroa de centro úmido ou bordas úmidas).
- **Compromisso Carga da Sapata (`WIC-401`) $\times$ Vapor de Secagem (`PIC-502`) $\times$ Volume Específico (*Bulk* `LAB-1203`):** Elevar `WIC-401` de $800$ para $1.000\text{ kN/m}$ aumenta a sequidade pós-prensa em $\sim +0,8\%$, reduzindo a demanda de vapor na pré-secagem em $\sim 3,2\%$; porém, compacta irreversivelmente a matriz fibrosa úmida, reduzindo a espessura final (`AIC-905`) em $\sim 2\text{ a }3\text{ }\mu\text{m}$ e a rigidez do papel A4.

### 4.4 Alarmes Típicos e Limites (ISA-18.2)

- **`PIC-405` + Oscilador do Chuveiro de Alta Pressão:** Alarme e **Intertravamento Crítico (Trip)**: se a velocidade do oscilador cair a zero com pressão $> 5\text{ bar}$, a válvula de bloqueio fecha instantaneamente em $< 1\text{ s}$ (um jato agulha parado a $16\text{ bar}$ corta um feltro de $8\text{ m}$ como uma faca hidráulica em poucos segundos).
- **`SDIC-406` (Estiramento Prensa–Secagem):** `LL = 0,9%` (folha ensacando no rolo central e enrolando na faca raspadora), `HH = 3,5%` (estiramento plástico excessivo, perda de elasticidade MD e quebra por tração na entrada da secagem).

### 4.5 Falhas e Anormalidades Comuns

| Anormalidade / Falha | Sintoma Observado no Processo | Causa Provável | Variáveis Precursoras no Gêmeo Digital |
| :--- | :--- | :--- | :--- |
| **Vibração de Barring / Corrugação de Feltro (*Press Bounce*)** | Vibração severa na estrutura da prensa e barras transversais periódicas de umidade/espessura no papel | Compactação irregular do feltro na frequência de batimento do rolo ou desgaste ondulatório da capa do rolo | Subida do pico espectral de vibração `VT-1207` nos mancais da prensa na frequência de giro do feltro ($f_{feltro}$) ou harmônicas da rotação do rolo |
| **Entupimento de bicos do chuveiro AP ou da Caixa *Uhle*** | Listras úmidas longitudinais (*wet streaks*) visíveis no scanner pré-colagem (`AIC-901`) | Bico entupido no chuveiro oscilante deixando uma faixa sem limpeza no feltro | Aumento localizado e fixo na matriz CD de `AIC-901` com largura de $50\text{–}100\text{ mm}$ combinado com aumento do vácuo médio `PIC-404` |

---

## 5. Seção de Pré-Secagem (*Pre-Dryer Section, Steam & Condensate, Hood*)

### 5.1 Fundamentos Físico-Químicos e Funcionamento

A pré-secagem recebe a folha com **$50\text{–}52\%$ de sequidade** ($0,92\text{ a }1,00\text{ kg H}_2\text{O/kg fibra}$) e evapora cerca de **$90\%$ de toda a água térmica da máquina**, entregando a folha no scanner pré-colagem com **$94,5\text{–}95,5\%$ de sequidade** ($4,5\text{–}5,5\%$ de umidade):

1. **Configuração dos Cilindros (*Single-Tier / Unirun* e *Double-Tier*):** Os primeiros 3 a 4 grupos operam em configuração de **fileira única (*Single-Tier / SymRun / DuoRun*)** com cilindros secadores de ferro fundido ($\varnothing = 1,83\text{ m}$ ou $2,0\text{ m}$) em cima e rolos guia aspirados (*VacRolls*, vácuo de $-1,5\text{ a }-3,5\text{ kPa}$, `PIC-508`) embaixo. Nessa geometria, a folha permanece $100\%$ suportada pela tela secadora sem nenhum passe aberto (*open draw*), eliminando o *sheet flutter* (vibração aerodinâmica de borda) quando a folha ainda está úmida e fraca. Os últimos grupos antes do *film press* operam em **dois níveis (*Double-Tier*)** para secar simetricamente ambas as faces da folha.
2. **Curva de Secagem em Três Fases:**
   - **Fase de Aquecimento (Grupo 1 — *Warm-up*, cilindros 1 a 6):** A pressão de vapor (`PIC-501`) é escalonada de subatmosférica ($-20\text{ kPa rel}$, $T_{sat} \approx 93\text{ }^\circ\text{C}$) até $+40\text{ kPa rel}$ ($T_{sat} \approx 109\text{ }^\circ\text{C}$). Se a folha úmida ($50\text{ }^\circ\text{C}$) tocar um cilindro muito quente ($> 120\text{ }^\circ\text{C}$) logo na entrada, a fervura brusca na interface arrancará fibras (*picking*) que sujarão os cilindros e degradarão a transferência térmica.
   - **Fase de Taxa Constante de Evaporação (Grupos 2 a 4):** Toda a superfície das fibras está coberta por água livre e capilar. A pressão de vapor sobe progressivamente (`PIC-502` até **$180\text{–}320\text{ kPa rel}$**, $T_{sat} = 131\text{–}146\text{ }^\circ\text{C}$), mantendo a temperatura da folha estabilizada pelo resfriamento evaporativo em $\sim 78\text{–}88\text{ }^\circ\text{C}$. A taxa específica de evaporação atinge **$22\text{–}30\text{ kg H}_2\text{O}/(\text{m}^2\cdot\text{h})$** de área aquecida de cilindro.
   - **Fase de Taxa Decrescente (Final do Grupo 4 e Grupo 5, sequidade $> 82\%$):** A água livre nos macroporos acaba; resta apenas a água higroscópica ligada nos microporos da parede celular. A resistência à difusão interna aumenta, a taxa de evaporação cai e a temperatura da folha sobe rapidamente aproximando-se de $100\text{–}108\text{ }^\circ\text{C}$.
3. **Sistema de Vapor e Condensado em Cascata, Sifões e $\Delta P$:**
   A mais de $\sim 400\text{ m/min}$, a força centrífuga supera a gravidade e o condensado dentro do cilindro forma um **anel líquido rotativo (*rimming ring*)** preso à parede interna. Como a condutividade térmica da água líquida ($k_{agua} \approx 0,68\text{ W/m}\cdot\text{K}$) é cerca de **75 vezes menor** que a do ferro fundido do cilindro ($k_{ferro} \approx 50\text{ W/m}\cdot\text{K}$), esse filme líquido é a principal resistência térmica à secagem.
   - **Sifões Estacionários ou Rotativos com Barras de Turbulência (*Spoiler Bars*):** Barras longitudinais internas geram ressonância no anel de condensado (aumentando a transferência convectiva em $40\text{–}60\%$), e a sapata do sifão (posicionada a **$1,5\text{–}2,0\text{ mm}$** da parede interna do cilindro) aspira continuamente o condensado através da junta rotativa (*rotary joint*) para fora do cilindro.
   - **Pressão Diferencial do Sifão ($\Delta P$, `PDIC-503`):** Para vencer a força centrífuga e o atrito bifásico no tubo do sifão a $1.250\text{ m/min}$, mantém-se um diferencial de pressão rigoroso de **$30\text{ a }50\text{ kPa}$** entre o coletor de entrada de vapor e o tanque separador de condensado, garantindo **$15\text{ a }25\%$ de vapor de passagem (*blow-through steam*)** que arrasta a água em regime anular/névoa.
   - **Cascata e Termocompressores:** O vapor de passagem (*blow-through*) e o vapor *flash* separados no tanque do Grupo Principal (ex.: Grupo 5 a $240\text{ kPa}$) alimentam o coletor de vapor do grupo anterior (Grupo 3/4 a $150\text{ kPa}$), que por sua vez alimenta o Grupo 2 ($70\text{ kPa}$) e o Grupo 1 ($15\text{ kPa}$). Termocompressores usam vapor motriz de média pressão ($800\text{–}1.200\text{ kPa}$) para recomprimir o vapor *flash* e permitir controle independente de pressão em grupos críticos.
4. **Capota Fechada (*Closed Hood*), Linha de Zero e Ventilação de Bolsões (*Pocket Ventilation*):**
   Os cilindros secadores ficam confinados dentro de uma capota termicamente isolada. O ar úmido é extraído a **$82\text{–}88\text{ }^\circ\text{C}$** (`TIC-504`) com **ponto de orvalho de $58\text{–}62\text{ }^\circ\text{C}$** (`AIC-506`, correspondente a $0,14\text{–}0,17\text{ kg H}_2\text{O/kg ar seco}$). Trocadores ar-ar e ar-água recuperam o calor latente da exaustão para aquecer o ar de insuflamento (`TIC-505`, $95\text{–}110\text{ }^\circ\text{C}$) injetado diretamente nos bolsões pelas caixas estabilizadoras (*RunBoxes*), reduzindo a pressão parcial de vapor junto à folha. O balanço entre ar insuflado ($\sim 72\%$ da vazão mássica extraída) e exaurido controla a **Linha de Zero (*Zero Pressure Line*, `PIC-507`)** a $\sim 1,5\text{ m}$ de altura: abaixo da linha de zero a pressão é levemente negativa (evitando fuga de calor para a sala) e no teto é levemente positiva (mas abaixo do ponto de condensação).

### 5.2 Tabela de Variáveis — Seção 5 (ISA-5.1)

| Nome da Variável | TAG ISA-5.1 | Unidade | Faixa Típica | Local de Medição | Instrumento | Freq. | Controlada? | MV (Atuador) | Fonte / Confiança |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Pressão de Vapor do 1º Grupo (*Warm-up*) | `PIC-501` | $\text{kPa rel}$ | $-30\text{ a }+60$ (Alvo: $15$) | Coletor de vapor do Grupo 1 | Transmissor de pressão composto (`PT-501`) | $2\text{ Hz}$ | Sim | Válvula de vapor / descarga ao condensador (`PV-501`) | Paulapuro Book 9 / Kadant (Alta) |
| Pressão de Vapor dos Grupos Principais | `PIC-502` | $\text{kPa rel}$ | $120\text{–}350$ (Alvo: $230$) | Coletores de vapor dos Grupos 4 e 5 | Transmissor de pressão manométrica (`PT-502`) | $2\text{ Hz}$ | Sim | Válvula principal de vapor (`PV-502`) em cascata com `AIC-901` | Paulapuro Book 9 / Valmet (Alta) |
| $\Delta P$ dos Sifões dos Cilindros Secadores | `PDIC-503` | $\text{kPa}$ | $25\text{–}55$ (Alvo: $38$) | Coletor de vapor vs. tanque separador | Transmissor de pressão diferencial (`PDT-503`) | $2\text{ Hz}$ | Sim | Válvula de *blow-through* / termocompressor (`PDV-503`) | Kadant Johnson / TAPPI (Alta) |
| Nível do Tanque Separador de Condensado | `LIC-504` | $\%$ | $30\text{–}70$ (Alvo: $50$) | Vaso separador de cada grupo de vapor | Transmissor diferencial / radar guiado (`LT-504`) | $2\text{ Hz}$ | Sim | Válvula de recalque da bomba de condensado (`LV-504`) | Kadant Johnson (Alta) |
| Temperatura do Ar de Insuflamento (*PV Air*) | `TIC-505` | $^\circ\text{C}$ | $90\text{–}115$ (Alvo: $102$) | Duto principal das caixas *Pocket Ventilation* | Termorresistência Pt100 (`TT-505`) | $1\text{ Hz}$ | Sim | Válvula de vapor da bateria aquecedora de ar (`TV-505`) | Paulapuro Book 9 (Alta) |
| Ponto de Orvalho da Exaustão da Capota | `AIC-506` | $^\circ\text{C } (T_d)$ | $56\text{–}64$ (Alvo: $60$) | Dutos de exaustão da capota fechada | Transmissor óptico/capacitivo de ponto de orvalho | $1\text{ Hz}$ | Sim | Inversores VFD dos exaustores da capota | TAPPI TIP 0404-43 / Vaisala (Alta) |
| Altura da Linha de Zero da Capota | `PIC-507` | $\text{mm}$ | $1.200\text{–}2.000$ (Alvo: $1.600$) | Sensores micro-Pa no teto/piso da capota | Transmissor diferencial $-25\text{ a }+25\text{ Pa}$ | $1\text{ Hz}$ | Sim | Inversores dos ventiladores de insuflamento | Voith EcoHood / Valmet (Alta) |
| Tensão das Telas Secadoras | `TIC-508` | $\text{kN/m}$ | $2,0\text{–}4,0$ (Alvo: $2,8$) | Rolo medidor de cada tela secadora | Células de carga nos mancais (`TT-508`) | $2\text{ Hz}$ | Sim | Cilindro do esticador da tela secadora (`TZ-508`) | Albany Int. / Paulapuro (Alta) |

### 5.3 Malhas de Controle Principais e Acoplamentos

- **Cascata Umidade Pré-Colagem (`AIC-901`) $\rightarrow$ Pressão de Vapor (`PIC-502`) com Preditor de Smith / MPC:** Como a inércia térmica da parede de ferro fundido dos cilindros secadores é elevada (constante de tempo dominante $\tau \approx 45\text{–}75\text{ s}$) somada ao atraso de transporte, um controlador PID simples oscilaria. O QCS utiliza um observador de estado (Preditor de Smith ou MPC) com ação *feedforward* da velocidade da máquina (`SIC-1104`), da vazão de massa (`FIC-105`) e da quebra de folha.
- **Acoplamento $\Delta P$ do Sifão (`PDIC-503`) $\times$ Pressão de Vapor (`PIC-502`) $\times$ Cascata:** Quando a malha de umidade pede redução rápida de vapor no Grupo 5 (`PIC-502` cai), o diferencial de pressão entre o Grupo 5 e o Grupo 4 diminui; se `PDIC-503` cair abaixo de $20\text{ kPa}$, o termocompressor abre ou a válvula de descarga para o condensador atua para impedir que os cilindros do Grupo 5 alaguem.

### 5.4 Alarmes Típicos e Limites (ISA-18.2)

- **`PDIC-503` ($\Delta P$ dos Sifões):** `LL = 18 kPa` (Prioridade Alta — risco iminente de perda do fluxo bifásico e alagamento de cilindros secadores; atraso $15\text{ s}$).
- **`LIC-504` (Nível do Tanque de Condensado):** `HH = 85%` (Prioridade Alta — retorno de condensado para o coletor de saída dos sifões, alagando todos os cilindros do grupo simultaneamente).
- **`AIC-506` (Ponto de Orvalho da Capota):** `HH = 65 °C` (Prioridade Média/Alta — condensação no teto interno da capota e gotejamento de água ferrugenta sobre a folha de papel).

### 5.5 Falhas e Anormalidades Comuns

| Anormalidade / Falha | Sintoma Observado no Processo | Causa Provável | Variáveis Precursoras no Gêmeo Digital |
| :--- | :--- | :--- | :--- |
| **Cilindro Secador Alagado (*Flooded Dryer Cylinder*)** | Sobrecarga de torque no grupo de acionamento seccional, aumento da umidade na saída (`AIC-901`) e vibração grave caso o anel colapse (*sloshing*) | Quebra/desgaste da sapata do sifão (folga $> 4\text{ mm}$), furo no tubo pescador ou queda de `PDIC-503` $< 18\text{ kPa}$ | Elevação da corrente/torque do motor seccional do grupo (`SIC-1104`) + queda da temperatura superficial daquele cilindro na termografia ($\Delta T = -15\text{ a }-25\text{ }^\circ\text{C}$) |
| **Sujidade nos cilindros do 1º/2º grupo (*Dryer Coating / Picking*)** | Queda gradual da eficiência de secagem (exigindo `PIC-502` cada vez mais alto para a mesma velocidade) e defeitos superficiais | Temperatura excessiva no Grupo 1 (`PIC-501` $> 50\text{ kPa}$) ou falha de oscilação/carga das facas raspadoras (*doctor blades*) | Aumento da relação $\text{Pressão de Vapor} / \text{Taxa de Evaporação}$ calculada pelo balanço térmico do Gêmeo Digital |

---

## 6. Colagem Superficial — Prensa de Filme (*Film Press / SpeedSizer*)

### 6.1 Fundamentos Físico-Químicos e Funcionamento

Em velocidades acima de $900\text{–}1.000\text{ m/min}$, uma prensa de colagem por poça convencional (*Pond Size Press*) sofre turbulência violenta, projeção da poça e quebras constantes. Por isso, máquinas modernas a $1.200\text{–}1.300\text{ m/min}$ utilizam exclusivamente uma **Prensa de Filme (*Metered Size Press / Film Press*, ex.: *Voith SpeedSizer* ou *Valmet OptiSizer Film*)**:

1. **Princípio da Pré-Dosagem por Barra Ranurada (*Grooved Metering Rod*):** Em vez de formar uma poça entre os dois rolos, cada rolo aplicador (revestido com elastômero/poliuretano de dureza **$20\text{–}35\text{ P\&J}$**) recebe em sua superfície um filme líquido micrométrico pré-dosado por um cabeçote com uma **barra de aço inox cromada e micro-ranurada (*grooved rod*, diâmetro $25\text{–}38\text{ mm}$)** que gira lentamente no sentido oposto ao rolo. A barra é pressionada contra o rolo por uma mangueira pneumática (`PIC-604`, $0,8\text{–}3,0\text{ bar}$). A espessura úmida do filme ($h_{umido} \approx 14\text{–}22\text{ }\mu\text{m}$ por lado) é determinada primordialmente pelo volume geométrico das ranhuras da barra e ajustada finamente em $\pm 15\%$ pela pressão da mangueira `PIC-604` (maior pressão comprime mais a capa elástica do rolo sob a barra, reduzindo a passagem de filme).
2. **Transferência no Nip e Penetração Capilar (Equação de Lucas-Washburn sob Pressão):** Os dois filmes pré-dosados nos rolos Topo e Tela encontram a folha de papel (que entra a $5,0\text{–}5,5\%$ de umidade e $\sim 85\text{ }^\circ\text{C}$) no nip carregado com **$W_{nip} = 35\text{–}75\text{ kN/m}$** (`WIC-605`). Sob o pulso hidrodinâmico do nip, cerca de $95\text{–}98\%$ do filme transfere-se e penetra nas primeiras camadas porosas da folha segundo a equação de penetração capilar-hidrodinâmica:
   $$L_{penetracao} \propto \sqrt{\frac{r_{poro}^2 \cdot \Delta P_{nip} \cdot t_{nip}}{4 \cdot \mu_{amido}}}$$
   Se a solução de amido penetrar demais (viscosidade muito baixa, papel base com $\text{Cobb}_{60}$ alto / sem cola interna), o amido se perde no meio da folha (*z-direction*) e não ancora as fibras superficiais. Se penetrar de menos (viscosidade muito alta, papel com excesso de AKD), o filme divide-se na saída do nip (*film splitting*), gerando **nebulização (*misting*)** intensa e aspecto de casca de laranja.
3. **Formulação e Reologia da Calda de Amido Superficial:**
   - **Sólidos (`AIC-601`):** **$8,0\text{ a }12,0\%$** (Alvo típico: **$9,5\%$**, muito superior aos $4\text{–}6\%$ das prensas de poça antigas, reduzindo drasticamente a água injetada na folha e o vapor gasto na pós-secagem).
   - **Aplicação Seca (*Dry Pick-up*):** **$1,5\text{ a }2,2\text{ g/m}^2$ por lado** (total de **$3,0\text{ a }4,5\text{ g/m}^2$** de amido seco + OBA + sal divalente $\text{CaCl}_2/\text{NaCl}$ para fixação de tinta jato de tinta *ColorLok* + agente de colagem superficial polimérico SAE/AKD).
   - **Temperatura (`TIC-603`) e Viscosidade (`AI-602`):** Mantida rigorosamente a **$60\text{–}66\text{ }^\circ\text{C}$** com viscosidade Brookfield ($100\text{ rpm}$) de **$25\text{ a }60\text{ mPa}\cdot\text{s}$** (amido de milho ou mandioca degradado enzimaticamente por $\alpha$-amilase ou oxidado). Abaixo de $54\text{ }^\circ\text{C}$, as cadeias de amilose sofrem **retrogradação** (recristalização), disparando a viscosidade.

### 6.2 Tabela de Variáveis — Seção 6 (ISA-5.1)

| Nome da Variável | TAG ISA-5.1 | Unidade | Faixa Típica | Local de Medição | Instrumento | Freq. | Controlada? | MV (Atuador) | Fonte / Confiança |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Teor de Sólidos da Calda de Amido | `AIC-601` | $\%$ | $7,0\text{–}13,0$ (Alvo: $9,5$) | Linhas de alimentação dos cabeçotes Topo e Tela | Refratômetro óptico em linha (`AT-601`, ex.: Vaisala PR-23) | $1\text{ Hz}$ | Sim | Válvula de água morna de diluição (`AV-601`) | Voith SpeedSizer / Paulapuro (Alta) |
| Viscosidade Brookfield do Amido | `AI-602` | $\text{mPa}\cdot\text{s}$ | $20\text{–}80$ (Alvo: $40$) | Tanque de trabalho / recalque (a $63\text{ }^\circ\text{C}$) | Viscosímetro em linha + Lab Brookfield $100\text{ rpm}$ | Cont. / $4\text{ h}$ | Não | Ajustada na dosagem de enzima no *jet cooker* | Paulapuro Book 11 / TAPPI (Alta) |
| Temperatura do Amido na Alimentação | `TIC-603` | $^\circ\text{C}$ | $58\text{–}68$ (Alvo: $63$) | Coletor de entrada dos cabeçotes | Termorresistência Pt100 (`TT-603`) | $1\text{ Hz}$ | Sim | Válvula de vapor do trocador de calor de amido (`TV-603`) | Voith SpeedSizer Manual (Alta) |
| Pressão da Mangueira da Barra (*Rod Tube*) | `PIC-604` | $\text{bar}$ | $0,8\text{–}3,0$ (Alvo: $1,6$) | Leito das barras ranuradas Topo (`A`) e Tela (`B`) | Transmissores de pressão (`PT-604A/B`) | $2\text{ Hz}$ | Sim | Conversores I/P independentes (`PV-604A/B`) | Voith / BTG Metering Rods (Alta) |
| Carga Linear no Nip do *Film Press* | `WIC-605` | $\text{kN/m}$ | $35\text{–}75$ (Alvo: $50$) | Braços de fechamento dos rolos aplicadores | Células de carga / pressão hidráulica (`WT-605`) | $5\text{ Hz}$ | Sim | Válvula proporcional de carga do nip (`WV-605`) | Voith SpeedSizer / Valmet (Alta) |

### 6.3 Malhas de Controle Principais e Acoplamentos

- **Controle de *Pick-up* de Amido e Balanço Topo/Tela:** A um teor de sólidos constante (`AIC-601` $= 9,5\%$), uma aplicação de $3,6\text{ g/m}^2$ de amido seco adiciona $\frac{3,6}{0,095} - 3,6 \approx 34,3\text{ g/m}^2$ de água à folha, elevando a umidade instantaneamente de **$5,2\%$ na entrada (`AIC-901`) para $\sim 32\text{–}35\%$ na superfície e $\sim 14\text{–}17\%$ na média da folha** na saída do nip. Se a pressão da barra do Lado Topo (`PIC-604A`) estiver diferente do Lado Tela (`PIC-604B`), aplica-se mais água e amido em uma face, gerando tendência a encanoamento (*curl*) após a secagem.

### 6.4 Alarmes Típicos e Limites (ISA-18.2)

- **`TIC-603` (Temperatura do Amido):** `LL = 52 °C` (Prioridade Alta — início de retrogradação/gelificação do amido nas tubulações e entupimento das ranhuras das barras), `HH = 72 °C` (secagem de película de amido nos rolos e formação de grumos).
- **Rotação da Barra Dosadora (*Rod Rotation*):** `LL < 15 rpm` (Prioridade Crítica — se o motor de giro da barra parar com o nip fechado, a barra desgasta-se localmente em segundos e risca a folha inteira).

### 6.5 Falhas e Anormalidades Comuns

| Anormalidade / Falha | Sintoma Observado no Processo | Causa Provável | Variáveis Precursoras no Gêmeo Digital |
| :--- | :--- | :--- | :--- |
| **Estrias de Barra (*Rod Streaks*) e Vazamento de Borda** | Riscos longitudinais sem amido ou com excesso de umidade detectados no scanner final QCS | Fibra/grumo de amido seco preso em uma ranhura da barra ou desgaste do cromo da barra | Pico agudo estreito no perfil CD de umidade final (`AIC-903`) que não existia no scanner pré-colagem (`AIC-901`) |
| **Nebulização Severa (*Misting*) na Saída do Nip** | Chuva fina de gotículas de amido sujando a capota e o 1º secador da pós-secagem, causando quebras | Viscosidade do amido muito alta (`AI-602` $> 70\text{ mPa}\cdot\text{s}$) ou sólidos excessivos (`AIC-601` $> 12\%$) a $1.250\text{ m/min}$ | Queda de `TIC-603` ou elevação de `AIC-601` e `AI-602` |

---

## 7. Seção de Pós-Secagem (*After-Dryer Section*)

### 7.1 Fundamentos Físico-Químicos e Funcionamento

A pós-secagem (tipicamente 12 a 18 cilindros divididos em 2 ou 3 grupos, sendo o primeiro grupo *Single-Tier* ou com passador de ar sem toque e cilindros revestidos com cromo/teflon antiaderente, e o último grupo *Double-Tier* com controle independente de vapor superior e inferior) tem duas missões críticas:
1. **Evaporar a água adicionada pelo *Film Press* ($\sim 30\text{–}38\text{ g/m}^2$ de água):** Reduzindo a umidade da folha de $\sim 15\%$ de volta para o alvo comercial rigoroso de **$4,5\text{ a }5,2\%$** (`AIC-903`) na enroladeira. Nos primeiros 2 a 4 cilindros após o *film press*, a pressão de vapor é mantida baixa ($20\text{–}60\text{ kPa rel}$) e os cilindros possuem revestimento antiaderente para que o filme de amido úmido e pegajoso consolide sua película sem colar no metal quente.
2. **Controle Ativo de Encanoamento (*Curl Control* via *Split Top/Bottom Steam*):** O papel *cut-size* passa em impressoras laser/xerográficas onde o fusor aquece a folha a $180\text{–}200\text{ }^\circ\text{C}$ em frações de segundo. Qualquer tensão residual assimétrica entre o Lado Topo e o Lado Tela faz a folha encanoar (*curl*) e atolar na copiadora. Na fase final da pós-secagem, a face da folha que seca **por último** sofre maior retração higroscópica sob restrição e puxa a curvatura do papel em sua direção. Assim, ajustando o **Diferencial de Pressão de Vapor entre os Cilindros Superiores e Inferiores (`PDIC-702`, $-80\text{ a }+80\text{ kPa}$)** no último grupo da pós-secagem, o operador desloca o plano neutro de encolhimento e zera o *curl* final da folha.

### 7.2 Tabela de Variáveis — Seção 7 (ISA-5.1)

| Nome da Variável | TAG ISA-5.1 | Unidade | Faixa Típica | Local de Medição | Instrumento | Freq. | Controlada? | MV (Atuador) | Fonte / Confiança |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Pressão de Vapor Principal da Pós-Secagem | `PIC-701` | $\text{kPa rel}$ | $40\text{–}250$ (Alvo: $140$) | Coletores de vapor da pós-secagem | Transmissor de pressão (`PT-701`) | $2\text{ Hz}$ | Sim | Válvulas de vapor (`PV-701`) em cascata com Umidade Final (`AIC-903`) | Paulapuro Book 9 / ABB QCS (Alta) |
| Diferencial de Vapor Topo vs. Fundo (*Curl Bias*) | `PDIC-702` | $\text{kPa}$ | $-80\text{ a }+80$ (Alvo: $+15$) | Cilindros superiores vs. inferiores do último grupo | Cálculo no SDCD (`PT-701_Top - PT-701_Bot`) | $2\text{ Hz}$ | Sim | *Bias* simétrico nas válvulas superior e inferior | Paulapuro Book 9 / TAPPI T 520 (Alta) |
| Estiramento (*Draw*) *Film Press* $\rightarrow$ Pós-Secagem | `SDIC-703` | $\%$ | $-0,4\text{ a }+0,8$ (Alvo: $+0,2$) | Rolos do *Film Press* vs. 1º grupo pós-secagem | Encoders digitais dos motores seccionais | $50\text{ Hz}$ | Sim | Referência de velocidade da pós-secagem | Voith SpeedSizer / ABB (Alta) |

### 7.3 Malhas de Controle Principais e Acoplamentos

- **Desacoplamento Umidade Média (`AIC-903`) $\times$ Encanoamento (`PDIC-702`):** Se o laboratório reporta *curl* para o lado topo (`LAB-1212` $= +8\text{ mm}$) e o operador altera `PDIC-702` em $+20\text{ kPa}$, o bloco desacoplador no SDCD soma $+10\text{ kPa}$ nos cilindros superiores e subtrai $-10\text{ kPa}$ nos cilindros inferiores, mantendo a **soma térmica total constante** para não perturbar a umidade média na enroladeira (`AIC-903`).
- **Comportamento do *Draw* após o *Film Press* (`SDIC-703`):** Ao absorver água no *film press*, a rede celulósica sofre relaxação e expansão higroscópica longitudinal (alongando a folha), reduzindo o módulo de elasticidade em $\sim 45\%$. Por isso o *draw* `SDIC-703` é muito pequeno ($0,0\text{ a }+0,3\%$) e monitorado por célula de carga para evitar tanto o ensacamento (*baggy sheet*) quanto o rasgo de borda.

### 7.4 Alarmes Típicos e Limites (ISA-18.2)

- **`SDIC-703` / Tração na saída do *Film Press*:** `LL = -0,6%` (dobras entrando no 1º cilindro secador), `HH = +1,0%` (quebra por tração da folha úmida de amido).
- **`PIC-701` (Pressão de Vapor da Pós-Secagem):** `H = 230 kPa` (Prioridade Média — indica saturação da capacidade da pós-secagem por sólidos de amido muito baixos `AIC-601` ou entrada muito úmida `AIC-901`).

### 7.5 Falhas e Anormalidades Comuns

| Anormalidade / Falha | Sintoma Observado no Processo | Causa Provável | Variáveis Precursoras no Gêmeo Digital |
| :--- | :--- | :--- | :--- |
| **Incrustação de amido nos primeiros cilindros da pós-secagem** | Marcas escuras/arrancamento na folha e quebras frequentes logo após o *film press* | Pressão de vapor muito alta no 1º subgrupo pós-colagem ou falha na fita de limpeza das facas raspadoras | Subida da pressão do 1º cilindro pós-colagem acima de $70\text{ kPa}$ ou umidade de saída do *film press* excessiva |
| **Desvio severo de *Curl* nas resmas A4** | Ondulação ou encanoamento nas copiadoras de teste apesar de umidade dentro da faixa | Alteração na relação Jato/Tela (`XHIC-202`) ou diferença de pressão entre as barras do *film press* (`PIC-604A/B`) não compensada em `PDIC-702` | Diferença $|PIC\text{-}604A - PIC\text{-}604B| > 0,4\text{ bar}$ ou desvio em `PDIC-702` |

---

## 8. Calandra (*Soft Calender*)

### 8.1 Fundamentos Físico-Químicos e Funcionamento

Para papéis de imprimir e escrever não revestidos (*cut-size*), uma calandra dura convencional (rolo de aço contra rolo de aço) esmagaria os pontos mais altos (flocos), produzindo espessura uniforme mas densidade local heterogênea (manchamento de impressão — *mottling*) e perda severa de volume específico (*bulk*) e rigidez. Por isso utiliza-se uma **Calandra Macia (*Soft Calender*, 1 ou 2 nips simples invertidos, ex.: *Valmet OptiCalender Soft* ou *Voith NipcoMat*)**:

1. **Mecânica do Nip Macio e Plastificação Termomecânica:** Cada nip é formado por um **Rolo Térmico (*Thermo Roll*)** de ferro fundido coquilhado aquecido internamente por óleo térmico a **$100\text{–}150\text{ }^\circ\text{C}$** (`TIC-802`) contra um **Rolo Macio (*Soft Roll*)** revestido com compósito polimérico elástico (dureza $88\text{–}94\text{ Shore D}$) dotado de sapatas hidrostáticas internas de abaulado variável. Como a capa polimérica deforma-se elasticamente sobre os flocos de fibras, o nip transfere calor e pressão de forma mais isobárica (**carga linear `WIC-801` de $60\text{ a }180\text{ kN/m}$**), plastificando apenas as fibras superficiais (acima da temperatura de transição vítrea $T_g$ da hemicelulose e do amido a $\sim 5\%$ de umidade) sem colapsar o núcleo poroso da folha.
2. **Efeito em Espessura (*Caliper*), Rugosidade Bendtsen e Rigidez:**
   A rigidez à flexão (*Bending Stiffness*, $S_b$) de uma folha de papel é proporcional ao **cubo da espessura ($t^3$)**:
   $$S_b = \frac{E \cdot t^3}{12}$$
   onde $E$ é o módulo de Young e $t$ é a espessura (`AIC-905`). Portanto, se o operador carregar excessivamente a calandra (`WIC-801` alto) reduzindo a espessura de $103\text{ }\mu\text{m}$ para $95\text{ }\mu\text{m}$ ($-7,8\%$), a rigidez da folha A4 cai em **$1 - (0,922)^3 \approx -21,6\%$**, deixando o papel "mole" e propenso a atolar em impressoras! O controle ótimo na calandra busca atingir exatamente a espessura alvo de **$101\text{–}104\text{ }\mu\text{m}$** (para $75\text{ g/m}^2$, garantindo a altura exata de $51\text{ mm}$ na resma de 500 folhas) com rugosidade Bendtsen de **$140\text{–}180\text{ mL/min}$**.

### 8.2 Tabela de Variáveis — Seção 8 (ISA-5.1)

| Nome da Variável | TAG ISA-5.1 | Unidade | Faixa Típica | Local de Medição | Instrumento | Freq. | Controlada? | MV (Atuador) | Fonte / Confiança |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Carga Linear da Calandra *Soft* | `WIC-801` | $\text{kN/m}$ | $40\text{–}220$ (Alvo: $110$) | Cilindros hidráulicos e zonas do rolo macio | Transmissores de pressão hidráulica (`WT-801`) | $5\text{ Hz}$ | Sim | Válvulas proporcionais (`WV-801`) em cascata com Espessura QCS (`AIC-905`) | Valmet OptiCalender / Voith (Alta) |
| Temperatura do Rolo Térmico | `TIC-802` | $^\circ\text{C}$ | $80\text{–}160$ (Alvo: $120$) | Óleo térmico + pirômetro IR na camisa do rolo | Pt100 + pirômetros infravermelhos (`TT-802`) | $1\text{ Hz}$ | Sim | Válvula de 3 vias do skid de óleo térmico (`TV-802`) | Paulapuro Book 10 / Voith (Alta) |
| Atuadores de Perfil CD de Espessura | `TIC-803` | $\%$ | $0\text{–}100$ (Alvo médio: $45$) | Viga de indução ou jatos de ar no rolo térmico | Sistema de atuação CD de espessura do QCS | $1\text{ Hz}$ | Sim | Módulos de aquecimento indutivo ou válvulas de ar por zona | ABB Caliper Profiler / Honeywell (Alta) |

### 8.3 Malhas de Controle Principais e Acoplamentos

- **Controle MD e CD de Espessura (`AIC-905` $\rightarrow$ `WIC-801` e `TIC-803`):** A média MD de espessura lida no scanner final ajusta a carga linear média da calandra (`WIC-801`) e as zonas internas do rolo *Nipco/SymRoll*. Já os desvios estreitos no perfil CD de espessura comandam a barra de atuadores térmicos/indutivos (`TIC-803`): aquecer localmente uma zona de $50\text{ mm}$ do rolo metálico dilata seu raio em alguns micrômetros ($\Delta R \approx \alpha \cdot R \cdot \Delta T$), aumentando localmente a pressão no nip e reduzindo a espessura do papel naquela faixa transversal, evitando calombos (*hard streaks*) na bobina mãe.

### 8.4 Alarmes Típicos e Limites (ISA-18.2)

- **Temperatura Local da Capa Polimérica do Rolo Macio (Pirômetros IR de Varredura):** `H = 85 °C`, `HH = 92 °C` (Prioridade Crítica / **Trip de abertura instantânea do nip**: superaquecimento localizado por sobrecarga ou passagem de emenda/dobra delamina e explode a capa polimérica do rolo macio em segundos).
- **Gradiente de Aquecimento/Resfriamento do Rolo Térmico (`TIC-802`):** `H > 1,5 °C/min` (evita choque térmico e empenamento mecânico do cilindro de ferro coquilhado).

### 8.5 Falhas e Anormalidades Comuns

| Anormalidade / Falha | Sintoma Observado no Processo | Causa Provável | Variáveis Precursoras no Gêmeo Digital |
| :--- | :--- | :--- | :--- |
| **Queima / Marca na Capa do Rolo Macio (*Roll Cover Marking / Delamination*)** | Marca repetitiva na folha no perímetro exato do rolo macio e pico de vibração/temperatura | Passagem de bolha de amido/dobra ou borda do rolo descoberta sem papel em contato direto com o rolo térmico quente | Alarme do pirômetro IR de borda do rolo macio (`TT-802_Soft > 85 °C`) e subida de vibração `VT-1207` na frequência do rolo |
| **Queda de Opacidade e *Bulk* na Bobina** | Opacidade (`LAB-1210`) cai abaixo de $89\%$ ("efeito papel vegetal" / *blackening*) | Excesso de carga linear na calandra (`WIC-801` $> 180\text{ kN/m}$) somado a umidade alta ($> 5,5\%$) entrando no nip | Subida simultânea de `WIC-801` e `AIC-903` acompanhada de queda de `AIC-905` |

---

## 9. Scanners e Sistema de Controle de Qualidade (*QCS — Quality Control System*)

### 9.1 Fundamentos Físico-Químicos e Funcionamento

Uma máquina de imprimir e escrever moderna possui dois pórticos de medição em linha (*O-Frames*): o **Scanner Pré-Colagem** (antes do *Film Press*, medindo umidade e temperatura da folha) e o **Scanner Final (Enroladeira / *Reel Scanner*)**, que varre continuamente os $8,0\text{ m}$ de largura da folha de um lado a outro em **$15\text{ a }25\text{ s}$ por travessia (*scan*)**:

1. **Princípios Físicos dos Sensores do Cabeçote QCS:**
   - **Gramatura Total (`AIC-902`):** Atenuação de partículas $\beta$ emitidas por uma fonte selada de **Criptônio-85 ($^{85}\text{Kr}$)** ou Promécio-147 ($^{147}\text{Pm}$) segundo a lei exponencial de Beer-Lambert: $I = I_0 \exp(-\mu_m \cdot BW_{total})$. Como o coeficiente de absorção mássica $\mu_m$ do Carbonato de Cálcio ($Z$ mais alto devido ao Cálcio) difere da celulose e da água, o QCS compensa matematicamente a leitura Beta usando o sinal do sensor de cinzas e a temperatura da coluna de ar no entreferro. A **Gramatura Seca (*Bone-Dry Weight*)** é obtida descontando a umidade medida.
   - **Umidade (`AIC-901` e `AIC-903`):** Espectroscopia de absorção no **Infravermelho Próximo (NIR)** usando múltiplos comprimentos de onda: um feixe na banda de absorção da ligação $\text{O–H}$ da água ($\lambda_1 \approx 1,94\text{ }\mu\text{m}$), um feixe de referência na celulose ($\lambda_2 \approx 1,80\text{ }\mu\text{m}$) e feixes adicionais para compensação de espalhamento óptico.
   - **Teor de Cinzas (`AIC-904`):** Absorção preferencial de **Raios-X de baixa energia** ($4\text{–}15\text{ keV}$), onde os átomos de Cálcio ($\text{Ca}$, $Z=20$) possuem seção de choque fotoelétrica cerca de $10\text{ vezes maior}$ que os átomos leves da celulose ($\text{C, H, O}$).
   - **Espessura / *Caliper* (`AIC-905`):** Combinação de triangulação a **laser óptico** nas faces superior e inferior com medição de distância entre os cabeçotes superior e inferior por **relutância magnética / correntes parasitas (*eddy current*)** ou sapatas flutuantes em colchão de ar, atingindo repetibilidade de $\pm 0,3\text{ }\mu\text{m}$.
   - **Cor, Alvura ISO e Brancura CIE (`AIC-906`) e Opacidade (`AI-907`):** Espectrofotômetro de matriz de fotodiodos ($360\text{–}740\text{ nm}$) com lâmpada de xenônio pulsado e filtro UV motorizado calibrado dinamicamente para o iluminante padrão **CIE D65/$10^\circ$**, medindo simultaneamente coordenadas $L^*, a^*, b^*$, Alvura ISO ($R_{457}$), Brancura CIE e fluorescência do OBA.
2. **Separação Matemática MD vs. CD e Mapeamento de Atuadores (*Shrinkage Mapping*):**
   Como o cabeçote viaja transversalmente a $v_{scan} \approx 0,4\text{ m/s}$ enquanto o papel corre longitudinalmente a $v_{papel} = 20,83\text{ m/s}$, o sensor descreve uma trajetória **diagonal em zigue-zague** (cada varredura de $20\text{ s}$ cobre $8\text{ m}$ em CD e $416\text{ m}$ de papel em MD!). O algoritmo de filtragem bidimensional do QCS (filtro exponencial / Kalman) separa a matriz bruta $Y(x, t)$ em três componentes ortogonais:
   $$Y(x_i, t_k) = \underbrace{\bar{Y}_{MD}(t_k)}_{\text{Tendência MD Longa}} + \underbrace{\tilde{Y}_{CD}(x_i)}_{\text{Perfil CD Estacionário}} + \underbrace{\varepsilon_{res}(x_i, t_k)}_{\text{Variação Rápida / Ruído}}$$
   Além disso, como a folha sofre **encolhimento transversal (*CD shrinkage*) de $2,5\text{ a }4,5\%$** na secagem (mais acentuado nas bordas livres do que no centro, onde é restrita pela tensão da tela), o QCS mantém um modelo não-linear de alinhamento (*mapping*) que relaciona a coordenada $x$ em milímetros na enroladeira com a válvula de diluição correspondente `ZIC-205[j]` na caixa de entrada.

### 9.2 Tabela de Variáveis — Seção 9 (ISA-5.1)

| Nome da Variável | TAG ISA-5.1 | Unidade | Faixa Típica | Local de Medição | Instrumento | Freq. | Controlada? | MV (Atuador) | Fonte / Confiança |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Umidade Pré-Colagem (*Pre-Size Moisture*) | `AIC-901` | $\%$ | $3,5\text{–}7,5$ (Alvo: $5,2$) | Scanner antes do *Film Press* | Sensor NIR em pórtico de varredura | $10\text{ Hz}$ / $20\text{ s}$ scan | Sim | MD: Vapor pré-secagem (`PIC-502`); CD: Caixa de vapor (`PIC-403`) | ABB Ability QCS / Valmet IQ (Alta) |
| Gramatura Total e Seca na Enroladeira | `AIC-902` | $\text{g/m}^2$ | $68,0\text{–}92,0$ (Alvo: $75,0$) | Scanner final antes da enroladeira *Pope* | Sensor nuclear Beta ($^{85}\text{Kr}$) compensado | $20\text{ Hz}$ / $20\text{ s}$ scan | Sim | MD: Válvula de Massa (`FV-105`); CD: Válvulas de Diluição (`ZIC-205`) | ABB QCS / ISO 536 (Alta) |
| Umidade Final na Enroladeira | `AIC-903` | $\%$ | $3,8\text{–}6,0$ (Alvo: $4,8$) | Scanner final antes da enroladeira *Pope* | Sensor NIR multi-comprimento de onda | $20\text{ Hz}$ / $20\text{ s}$ scan | Sim | MD: Vapor pós-secagem (`PIC-701`); CD: Re-umedecedor / Prensa | ABB QCS / ISO 287 (Alta) |
| Teor de Cinzas Total na Enroladeira | `AIC-904` | $\%$ | $16,0\text{–}26,0$ (Alvo: $21,0$) | Scanner final antes da enroladeira *Pope* | Sensor de absorção de Raios-X | $1\text{ Hz}$ (média scan) | Sim | MD: Dosagem de PCC no circuito curto (`FIC-106`) | ABB QCS / ISO 1762 (Alta) |
| Espessura na Enroladeira (*Reel Caliper*) | `AIC-905` | $\mu\text{m}$ | $88\text{–}122$ (Alvo: $102$) | Scanner final antes da enroladeira *Pope* | Sensor óptico/laser + indução magnética | $20\text{ Hz}$ / $20\text{ s}$ scan | Sim | MD: Carga calandra (`WIC-801`); CD: Indução/Ar (`TIC-803`) | ABB QCS / ISO 534 (Alta) |
| Alvura ISO / Brancura CIE e Cor $L^*a^*b^*$ | `AIC-906` | $\% \text{ ISO} / \text{CIE}$ | $98\% \text{ ISO} / 160\text{ CIE}$ | Scanner final antes da enroladeira *Pope* | Espectrofotômetro online c/ controle UV | $1/20\text{ Hz}$ | Sim | MD: Bombas de OBA (`FIC-110`) e corantes violeta/azul | ISO 11475 / ABB QCS (Alta) |
| Opacidade em Linha (*Online Opacity*) | `AI-907` | $\%$ | $88,0\text{–}95,0$ (Alvo: $91,5$) | Scanner final antes da enroladeira *Pope* | Módulo óptico de contraste do scanner | $1/20\text{ Hz}$ | Não | Monitorada; ajustada via PCC (`FIC-106`) e calandra (`WIC-801`) | ISO 2471 / ABB QCS (Alta) |

### 9.3 Malhas de Controle Principais e Acoplamentos

- **Matriz Multivariável QCS (MD-MPC):** As malhas de **Gramatura Seca (`AIC-902`)**, **Umidade (`AIC-903`)** e **Cinzas (`AIC-904`)** são fortemente acopladas:
  1. Um aumento na válvula de massa grossa (`FV-105`) aumenta a gramatura seca, mas traz mais água para a secagem (subindo a umidade `AIC-903`) e dilui a fração percentual de cinzas (`AIC-904`).
  2. Por isso, o QCS opera um controlador multivariável $3\times 3$: toda correção em `FV-105` dispara simultaneamente ajustes antecipatórios (*feedforward*) proporcionais na dosagem de PCC (`FIC-106`) e na pressão de vapor da secagem (`PIC-502` / `PIC-701`).

### 9.4 Alarmes Típicos e Limites (ISA-18.2)

- **Desvio $2\sigma$ dos Perfis Transversais (CD Spread):**
  - Gramatura Seca CD $2\sigma$: `H = 0,55 g/m²`, `HH = 0,75 g/m²` (meta de excelência $< 0,40\text{ g/m}^2$).
  - Umidade Final CD $2\sigma$: `H = 0,35%`, `HH = 0,50%` (meta $< 0,25\%$).
  - Espessura CD $2\sigma$: `H = 1,0 µm`, `HH = 1,5 µm` (acima de $1,2\text{ }\mu\text{m}$ gera corrugações e defeitos de dureza na bobina mãe).
- **Falha de Padronização (*Standardization Fault*):** A cada $30\text{–}60\text{ min}$ (ou durante quebras de folha), o cabeçote sai para a garagem lateral (*off-sheet*) para zerar os sensores contra padrões internos; se a deriva exceder a tolerância, gera alarme de manutenção instrumental e congela as malhas QCS em manual.

### 9.5 Falhas e Anormalidades Comuns

| Anormalidade / Falha | Sintoma Observado no Processo | Causa Provável | Variáveis Precursoras no Gêmeo Digital |
| :--- | :--- | :--- | :--- |
| **Desalinhamento do Mapeamento CD (*CD Mapping Shift*)** | Instabilidade em "dente de serra" nos atuadores de diluição (`ZIC-205`) ou espessura (`TIC-803`), piorando o $2\sigma$ CD quando o controle automático está ligado | Mudança de encolhimento da folha ou deslocamento dos sensores de borda da folha (*sheet edge detectors*) | Padrão alternado ($+ / - / + / -$) nas aberturas de atuadores vizinhos (`ZIC-205[i]` vs `ZIC-205[i+1]`) e subida da métrica de *actuator bending* |
| **Acúmulo de poeira de carbonato na janela óptica do sensor** | Deriva lenta da leitura de umidade (`AIC-903`) ou cinzas (`AIC-904`) em relação aos testes de laboratório | Falha no sopro de ar de purga das lentes do cabeçote do scanner | Aumento do ajuste de correção na padronização automática (*off-sheet check*) e divergência $|AIC\text{-}903 - LAB\text{-}1202| > 0,4\%$ |

---

## 10. Enroladeira Pope (*Reel / MasterReel / OptiReel*)

### 10.1 Fundamentos Físico-Químicos e Funcionamento

A enroladeira transforma a folha contínua que sai da calandra a $1.250\text{ m/min}$ em **Bobinas Mãe (*Jumbo Rolls* ou *Parent Rolls*)** com diâmetro final de **$2.600\text{ a }3.000\text{ mm}$** e massa de **$35\text{ a }55\text{ toneladas}$** cada (tempo de formação de cada bobina mãe $\approx 40\text{ a }50\text{ min}$):

1. **A Lei TNT do Enrolamento (*Torque, Nip, Tension*):** A estrutura mecânica interna da bobina mãe (tensão tangencial e pressão radial camada a camada) precisa começar firme junto ao carretel de aço (*reel spool*, diâmetro $\sim 600\text{–}800\text{ mm}$) e decair suavemente conforme o diâmetro cresce. Se o exterior da bobina for enrolado mais duro que o miolo, as camadas externas esmagam as internas, causando **estouros de camada (*bursts*)**, rugas de cisalhamento (*crepe wrinkles*) e deslizamento telescópico. O controle moderno coordena três parâmetros em função do diâmetro instantâneo (`ZI-1004`):
   - **Tension (`TIC-1002` — Tração da Folha, $250\text{–}420\text{ N/m}$):** Medida por células de carga no rolo guia antes do cilindro tambor (*Pope Drum*).
   - **Nip (`WIC-1001` — Carga Linear entre Cilindro Tambor e Bobina, $1,8\text{–}4,5\text{ kN/m}$):** Expulsa a camada limite de ar arrastada a $1.250\text{ m/min}$ (rertida também pelas ranhuras helicoidais do cilindro tambor) e induz tensão por atrito de rolamento (*nip-induced tension*).
   - **Torque (`JIC-1003` — Acionamento Central / *Center Drive* no Carretel):** Motor regenerativo acoplado diretamente ao eixo do carretel (*spool*), permitindo aplicar alto torque no início do enrolamento sem precisar esmagar o papel com carga de nip excessiva.
2. **Troca Automática de Bobina (*Turn-up*) e Emendas:** Quando a bobina nos trilhos secundários atinge a metragem exata para um número inteiro de tiradas nas cortadeiras de resma A4 (ex.: $52.000\text{ m}$), um novo carretel vazio nos braços primários é acelerado pelo acionamento primário até exatamente $1.250\text{ m/min}$, abaixado contra o cilindro tambor, e um dispositivo automático de corte e sopro por jato de ar/água de alta pressão (*Gooseneck / Air-Jet Turn-up*) ou fita adesiva transfere a folha para o carretel novo em frações de segundo sem perder um único metro de produção.

### 10.2 Tabela de Variáveis — Seção 10 (ISA-5.1)

| Nome da Variável | TAG ISA-5.1 | Unidade | Faixa Típica | Local de Medição | Instrumento | Freq. | Controlada? | MV (Atuador) | Fonte / Confiança |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Carga Linear no Nip da Enroladeira | `WIC-1001` | $\text{kN/m}$ | $1,5\text{–}5,5$ (Alvo: $3,2$) | Braços primários e carros secundários | Células de carga e pressão hidráulica (`WT-1001`) | $10\text{ Hz}$ | Sim | Servo-válvulas hidráulicas seguindo curva por diâmetro | Voith MasterReel / Valmet (Alta) |
| Tração da Folha na Entrada (*Web Tension*) | `TIC-1002` | $\text{N/m}$ | $220\text{–}480$ (Alvo: $330$) | Rolo guia medidor antes do cilindro *Pope* | Células de carga TS e DS (`TT-1002`) | $50\text{ Hz}$ | Sim | Velocidade/torque do cilindro *Pope* e *Center Drive* | Valmet OptiReel / ABB (Alta) |
| Torque do Acionamento Central (*Center Drive*) | `JIC-1003` | $\%$ / $\text{kNm}$ | $10\text{–}90\%$ (Alvo: $55\%$) | Acoplamento axial do carretel (*spool*) | Inversor regenerativo do *Center Drive* | $50\text{ Hz}$ | Sim | Referência de torque seguindo curva TNT | Voith / Valmet OptiReel (Alta) |
| Diâmetro e Metragem da Bobina Mãe | `ZI-1004` | $\text{mm}$ / $\text{km}$ | $600\text{–}3.000\text{ mm}$ ($52\text{ km}$) | Trilhos secundários e encoders | Sensor linear magnetostritivo + encoders | $10\text{ Hz}$ | Não | Dispara sequência automática de troca (*Turn-up*) | Voith / Valmet (Alta) |

### 10.3 Malhas de Controle Principais e Acoplamentos

- **Curvas Programadas TNT em função do Diâmetro (`ZI-1004`):** No momento da troca (*turn-up*, $D \approx 650\text{ mm}$), a carga de nip `WIC-1001` inicia em $\sim 4,2\text{ kN/m}$ e o torque central `JIC-1003` é elevado para fixar as primeiras camadas sobre o aço do carretel (evitando *bottom broke* / perda de fundo de bobina); à medida que $D$ cresce até $2.800\text{ mm}$ e o peso próprio da bobina aumenta para $45\text{ t}$, a carga de nip é reduzida linearmente para $\sim 2,4\text{ kN/m}$ com compensação dinâmica do atrito dos trilhos.

### 10.4 Alarmes Típicos e Limites (ISA-18.2)

- **`TIC-1002` (Tração da Folha):** `LL = 160 N/m` (Prioridade Alta — folha frouxa, entrada de ar e formação de rugas longitudinais), `HH = 520 N/m` (quebra seca antes da enroladeira).
- **Falha de Sincronismo de Velocidade do Carretel Novo no *Turn-up*:** $|\Delta V_{spool}| > 0,2\%$ (Prioridade Crítica — bloqueia a descida dos braços primários para evitar rasgo no momento da troca).

### 10.5 Falhas e Anormalidades Comuns

| Anormalidade / Falha | Sintoma Observado no Processo | Causa Provável | Variáveis Precursoras no Gêmeo Digital |
| :--- | :--- | :--- | :--- |
| **Calombos e Corrugações na Bobina (*Hard Streaks / Rope Marks*)** | Faixas circunferenciais salientes na bobina mãe que estiram o papel plasticamente e geram folhas tortas no corte A4 | Variação localizada no perfil CD de espessura (`AIC-905`) acumulada ao longo de $\sim 25.000$ voltas de papel ($50\text{ km}$) | Desvio local de espessura CD $> +1,5\text{ }\mu\text{m}$ na mesma posição transversal por mais de $10\text{ min}$ |
| **Perda de Fundo de Bobina (*Spool Bottom Broke / Crepe Wrinkles*)** | As últimas $30\text{–}80\text{ mm}$ de papel junto ao carretel aparecem rasgadas ou encrespadas na rebobinadeira | Excesso de carga de nip (`WIC-1001`) no meio da bobina cisalhando as camadas próximas ao carretel ou falta de torque inicial em `JIC-1003` | Desvio entre a curva real de pressão nos cilindros secundários e a curva TNT ideal durante o crescimento entre $700\text{ e }1.200\text{ mm}$ |

---

## 11. Sistemas de Apoio (*Auxiliary & Utility Systems*)

### 11.1 Fundamentos Físico-Químicos e Funcionamento

1. **Sistema de Vácuo Central (*Turbo Blowers* vs. Bombas de Anel Líquido):**
   Máquinas modernas utilizam **Turbocompressores Centrífugos de Velocidade Variável (*Turbo Blowers*, ex.: *Runtech EP Turbo*)** ou **Bombas de Anel Líquido (*Nash*)** divididos em coletores de Baixo Vácuo ($-10\text{ a }-30\text{ kPa}$), Médio Vácuo ($-35\text{ a }-55\text{ kPa}$) e Alto Vácuo ($-60\text{ a }-75\text{ kPa}$). Nos turbocompressores, a compressão adiabática eleva a temperatura do ar de exaustão para **$120\text{–}160\text{ }^\circ\text{C}$** sem usar água de selagem; esse calor é recuperado em trocadores para aquecer o ar dos bolsões da capota da secagem, economizando $1.500\text{ a }2.500\text{ kW}$ térmicos.
2. **Circuito de Água Branca e Filtro de Discos (*Disc Filter Saveall*):**
   O excesso de água branca do silo da máquina (contendo $0,18\text{–}0,25\%$ de finos e PCC) vai para o **Filtro de Discos (*Saveall*)**, onde recebe uma vazão de polpa virgem refinada (*sweetener stock*) para formar uma manta filtrante sobre os setores dos discos. O filtro divide o efluente em: **Filtrado Turvo** ($150\text{–}300\text{ mg/L}$, usado para diluição nos desagregadores), **Filtrado Claro** ($30\text{–}60\text{ mg/L}$, usado em diluições de consistência) e **Filtrado Superclaro** (**$< 25\text{ mg/L}$**, `AIC-1102`, aquecido e enviado para os chuveiros da seção de formação, substituindo água fresca). A manta recuperada retorna diretamente ao tanque de mistura.
3. **Sistema de Refugo (*Broke System*) e Desagregadores Sob Máquina (*Under-Machine Pulpers*):**
   Existem desagregadores dedicados sob os pontos críticos de descarga: **Fosso do *Couch* (*Couch Pit*)**, **Pulper da Prensa (*Press Pit*)**, **Pulper do *Film Press***, **Pulper da Calandra** e **Pulper da Enroladeira / Rebobinadeira**. Em marcha normal, apenas o *Couch Pit* recebe continuamente os refiles laterais da tela (*wet edge trim*, $\sim 150\text{ mm}$ de cada lado). Quando um sensor óptico detecta uma **quebra de folha**, os chuveiros de inundação de quebra (*break showers*) abrem instantaneamente no desagregador correspondente à seção onde a folha está caindo (vazão de diluição para absorver **$45\text{ t/h} = 750\text{ kg/min}$ de papel seco** mantendo a consistência em **$3,8\text{–}4,2\%$**, `AIC-1103`), bombeando para a Torre de Estocagem de Refugo (*Broke Tower*).
4. **Acionamentos Seccionais (*Sectional Drives*), Inversores e Divisão de Carga (*Load Sharing*):**
   A máquina possui $35\text{ a }50$ motores AC de indução ou síncronos de ímãs permanentes conectados a um barramento DC comum com inversores **ABB ACS880 MultiDrive (Controle Direto de Torque — DTC)** ou **Siemens Sinamics S120**. Cada seção independente tem um rolo **Mestre de Velocidade** (malha PI de velocidade de alta resposta, erro $< 0,01\%$), enquanto os demais rolos que compartilham a mesma tela ou feltro (ex.: rolo formador + rolo *couch*, ou cilindros secadores de um mesmo grupo) operam como **Escravos Seguidores de Torque (*Torque Helper / Load Sharing*)** para não deslizar nem rasgar a vestimenta.
5. **Lubrificação Circulatória de Mancais, Unidade de Óleo Térmico e Ar Comprimido:**
   - **Lubrificação Circulatória (`FIC-1105`):** Duas centrais principais (Lado Úmido com óleo ISO VG 150 e Lado Seco com óleo sintético ISO VG 220/320 resistente à oxidação térmica) bombeiam óleo filtrado ($6\text{–}10\text{ }\mu\text{m}$ absoluto, limpeza ISO 4406 código `15/13/10` ou melhor) através de medidores eletrônicos individuais para cada mancal ($1,5\text{–}5,0\text{ L/min}$ por mancal).
   - **Óleo Térmico da Calandra (`TIC-1106`):** Circuito fechado pressurizado que mantém vazão turbulenta nos furos periféricos do rolo térmico para garantir $\Delta T < 1,0\text{ }^\circ\text{C}$ ao longo dos $8\text{ m}$ de face.
   - **Ar de Instrumentação (`PI-1107`):** Mantido a **$6,0\text{–}7,0\text{ bar}$** e ponto de orvalho **$\le -25\text{ }^\circ\text{C}$** (norma ISA-7.0.01) para posicionadores de válvulas, carga de facas raspadoras (*doctors*), esticadores/guias de telas e sistema de passagem de fita a ar (*air tail threading*).

### 11.2 Tabela de Variáveis — Seção 11 (ISA-5.1)

| Nome da Variável | TAG ISA-5.1 | Unidade | Faixa Típica | Local de Medição | Instrumento | Freq. | Controlada? | MV (Atuador) | Fonte / Confiança |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Rotação / Potência dos *Turbo Blowers* de Vácuo | `SIC-1101` | $\text{rpm}$ / $\text{kW}$ | $3.000\text{–}6.500\text{ rpm}$ ($1.850\text{ kW}$) | Casa de vácuo | Inversor VFD + transmissor de pressão | $2\text{ Hz}$ | Sim | Rotação do VFD e válvulas anti-surge | Runtech / Nash (Alta) |
| Turbidez do Filtrado Superclaro (*Saveall*) | `AIC-1102` | $\text{mg/L}$ | $10\text{–}120$ (Alvo: $35$) | Saída do Filtro de Discos | Turbidímetro óptico em linha (`AT-1102`) | $1\text{ Hz}$ | Sim | Vazão de *sweetener stock* e rotação do filtro | Valmet OptiSave / Andritz (Alta) |
| Consistência dos Desagregadores (*Pulpers*) | `AIC-1103` | $\%$ | $3,2\text{–}5,0$ (Alvo: $4,0$) | Recalque das bombas dos *pulpers* | Transmissor de consistência (`AT-1103`) | $2\text{ Hz}$ | Sim | Válvulas de diluição + chuveiro de quebra | Voith / Andritz (Alta) |
| Velocidade Linear e Torque Seccional | `SIC-1104` | $\text{m/min}$ / $\%$ | $1.250\text{ m/min}$ ($30\text{–}90\%\text{ T}$) | Motores seccionais e *MultiDrive* | Encoders digitais + controle DTC | $100\text{ Hz}$ | Sim | Inversores de frequência seccionais | ABB / Siemens Drives (Alta) |
| Vazão e Temperatura de Óleo de Mancais | `FIC-1105` | $\text{L/min}$ / $^\circ\text{C}$ | $1,5\text{–}6,0\text{ L/min}$ ($55\text{ }^\circ\text{C}$) | Rotâmetros eletrônicos nos mancais | Monitores de fluxo Kytola/SKF + Pt100 | $1\text{ Hz}$ | Sim | Trocadores de calor e bombas da central | SKF / John Crane (Alta) |
| Temperatura e $\Delta P$ do Óleo Térmico | `TIC-1106` | $^\circ\text{C}$ / $\text{bar}$ | $80\text{–}180\text{ }^\circ\text{C}$ ($5,5\text{ bar}$) | Skid de óleo térmico da calandra | Pt100 entrada/saída + transmissores | $1\text{ Hz}$ | Sim | Válvula de 3 vias e bomba de circulação | Voith / Valmet (Alta) |
| Pressão do Ar Comprimido de Instrumentação | `PI-1107` | $\text{bar}$ | $5,8\text{–}7,5$ (Alvo: $6,5$) | Coletor geral da máquina de papel | Transmissor de pressão (`PT-1107`) | $1\text{ Hz}$ | Não | Compressores e secadores da central | ISA-7.0.01 (Alta) |

### 11.3 Malhas de Controle Principais e Acoplamentos

- **Lógica Automática de Quebra nos Desagregadores:** Quando o detector óptico de quebra na saída da prensa acusa folha partida (`XI-Break = 1`), a guilhotina de água na mesa (*trim squirt*) mantém a folha inteira caindo no *Couch Pit* ou *Press Pit*, e o SDCD abre em **modo *feedforward* pré-posicionado** a válvula de diluição de inundação para exatamente a vazão necessária para diluir $45\text{ t/h}$ de papel a $4,0\%$ de consistência ($\sim 1.080\text{ m}^3\text{/h}$ de água branca), antes mesmo de o sensor de consistência `AIC-1103` sentir o aumento de carga.

### 11.4 Alarmes Típicos e Limites (ISA-18.2)

- **`FIC-1105` (Vazão de Óleo de Lubrificação nos Mancais Críticos):** `L = 1,5 L/min` (Prioridade Alta), `LL = 1,0 L/min` por $> 10\text{ s}$ (Prioridade Crítica — partida imediata da bomba reserva e parada de proteção da seção se a pressão do coletor cair abaixo de $4,0\text{ bar}$).
- **`AIC-1102` (Turbidez do Filtrado Superclaro):** `HH = 100 mg/L` (Prioridade Alta — comuta automaticamente os chuveiros da máquina para água fresca aquecida para impedir o entupimento simultâneo de centenas de bicos de chuveiro).

### 11.5 Falhas e Anormalidades Comuns

| Anormalidade / Falha | Sintoma Observado no Processo | Causa Provável | Variáveis Precursoras no Gêmeo Digital |
| :--- | :--- | :--- | :--- |
| **Contaminação do óleo de lubrificação da secagem por água** | Óleo leitoso, oxidação acelerada e falha prematura de rolamentos dos cilindros secadores | Vazamento de vapor pela junta rotativa soprando contra o labirinto do mancal do lado acionamento (TS) | Subida do sensor capacitivo de saturação de água no óleo (`AI-WaterInOil > 500 ppm`) na central de lubrificação |
| **Embuxamento do *Couch Pit* durante quebra prolongada** | Nível alto transbordando e desarme por sobrecorrente do rotor do desagregador | Falha na abertura da válvula de chuveiro de quebra, elevando a consistência acima de $5,5\%$ | Subida simultânea de corrente do rotor do pulper, `AIC-1103 > 4,8%` e queda da vazão de bombeamento para a torre de refugo |

---

## 12. Qualidade do Produto Final e Ensaios de Laboratório (*Paper Testing Lab*)

### 12.1 Fundamentos Físico-Químicos e Funcionamento

Ao final de cada Bobina Mãe (*Turn-up*, a cada $\sim 45\text{ min}$), os operadores retiram uma tira transversal completa de $8,0\text{ m}$ do topo da bobina e a enviam ao laboratório automatizado de papel (ex.: **L&W Autoline** ou **Valmet Paper Lab**), mantido na atmosfera padrão **ISO 187 / TAPPI T 402 ($23,0 \pm 1,0\text{ }^\circ\text{C}$ e $50,0 \pm 2,0\%$ de umidade relativa)**:

1. **Gramatura (`LAB-1201`, ISO 536 / TAPPI T 410):** Massa por unidade de área ($\text{g/m}^2$). Determina a conformidade legal e comercial da resma e serve de referência primária para aferição da inclinação/offset do sensor Beta do QCS (`AIC-902`).
2. **Umidade (`LAB-1202`, ISO 287 / TAPPI T 412):** Determinada por perda de massa em estufa a $105 \pm 2\text{ }^\circ\text{C}$. Na faixa ideal de **$4,5\text{–}5,2\%$**, garante condutividade elétrica superficial suficiente para dissipar a carga triboelétrica gerada no corte de alta velocidade e no transporte dentro da copiadora xerográfica, sem reduzir a rigidez térmica no fusor.
3. **Espessura (`LAB-1203`, ISO 534 / TAPPI T 411) e Volume Específico (*Bulk*):** Medida sob pressão estática padronizada de $100\text{ kPa}$. Para $75,0\text{ g/m}^2$, uma espessura de **$102\text{ }\mu\text{m}$** corresponde a um *bulk* de $\frac{102}{75,0} = \mathbf{1,36\text{ cm}^3\text{/g}}$ (densidade aparente de $0,735\text{ g/cm}^3$). Garante rigidez à flexão e empacotamento sem folga ou travamento na encaixotadora de resmas.
4. **Lisura / Rugosidade Superficial Bendtsen (`LAB-1204`, ISO 8791-2):** Mede a vazão de ar ($\text{mL/min}$) que escapa entre uma coroa metálica plana de $0,15\text{ mm}$ de espessura apoiada sobre o papel e a superfície rugosa da folha sob pressão de $1,47\text{ kPa}$ (quanto **menor** o valor em $\text{mL/min}$, **mais liso** é o papel). Para papel *cut-size* / *offset*, a faixa típica é **$120\text{–}200\text{ mL/min}$** (alvo **$160\text{ mL/min}$**), com diferença máxima de $25\text{–}30\text{ mL/min}$ entre o Lado Topo e o Lado Tela.
5. **Porosidade / Permeância ao Ar Gurley (`LAB-1205`, ISO 5636-5 / TAPPI T 460) ou Bendtsen (ISO 5636-3):** No método Gurley, mede o tempo em segundos necessário para **$100\text{ mL}$ de ar** atravessarem $6,45\text{ cm}^2$ ($1\text{ pol}^2$) da folha (quanto **maior** o tempo em $\text{s/100 mL}$, **mais fechado** é o papel; típico **$12\text{–}22\text{ s/100 mL}$**, equivalente a $\sim 400\text{–}750\text{ mL/min}$ em porosidade Bendtsen). Se o papel for poroso demais ($< 10\text{ s/100 mL}$), as ventosas a vácuo das cortadeiras e impressoras aspiram ar através da primeira folha e puxam duas folhas juntas (*double feed*).
6. **Resistência à Tração MD e CD (`LAB-1206`, ISO 1924-2 / TAPPI T 494):** Força máxima por unidade de largura ($\text{kN/m}$) até a ruptura de uma tira de $15\text{ mm}$ de largura tracionada a taxa constante. Como as fibras orientam-se preferencialmente na direção da máquina e sofrem tensão de secagem em MD, a tração MD (**$4,5\text{–}6,2\text{ kN/m}$**) é cerca de $2,0\text{ a }2,3\text{ vezes}$ maior que a tração CD (**$2,0\text{–}2,8\text{ kN/m}$**).
7. **Resistência ao Rasgo Elmendorf (`LAB-1207`, ISO 1974 / TAPPI T 414):** Energia média (expressa em força $\text{mN}$) necessária para propagar um corte pré-existente usando um pêndulo balístico. Depende fundamentalmente do comprimento médio da fibra intacta e do trabalho de arrancamento (*pull-out*) das fibras da matriz: no início da refinação o rasgo sobe levemente, mas com o aumento da refinação e da densificação a fibra passa a quebrar em vez de ser arrancada, fazendo o rasgo cair.
8. **Teor de Cinzas (`LAB-1208`, ISO 1762 a $525\text{ }^\circ\text{C}$ / TAPPI T 211):** Incineração da matéria orgânica (celulose e amido) em mufla a **$525 \pm 25\text{ }^\circ\text{C}$**, temperatura escolhida especificamente porque o Carbonato de Cálcio ($\text{CaCO}_3$) decompõe-se termicamente em $\text{CaO} + \text{CO}_2\uparrow$ acima de $650\text{–}800\text{ }^\circ\text{C}$ (se medido a $900\text{ }^\circ\text{C}$ pela ISO 2144, aplica-se o fator estequiométrico $\frac{100,09}{56,08} = 1,785$). Faixa típica: **$19,0\text{–}23,0\%$**.
9. **Alvura ISO (`LAB-1209`, ISO 2470-1 / TAPPI T 452) e Brancura CIE (ISO 11475):** A Alvura ISO mede a refletância difusa restrita ao azul ($\lambda = 457\text{ nm}$, faixa típica **$96\text{–}104\%$** com contribuição UV do OBA), enquanto a **Brancura CIE (*CIE Whiteness*)** integra todo o espectro visível sob iluminante solar D65, refletindo a percepção visual humana de branco azulado (**$155\text{–}168\text{ CIE}$**).
10. **Opacidade (`LAB-1210`, ISO 2471 / TAPPI T 425):** Razão percentual entre a refletância luminosa de uma única folha sobre uma cavidade negra ($R_0$) e a refletância de uma pilha opaca infinita do mesmo papel ($R_\infty$). Governada pela teoria de **Kubelka-Munk** ($Opacidade = f(S \cdot BW, K \cdot BW)$, onde $S$ é o coeficiente de espalhamento de luz incrementado pelo PCC e pelos microvazios, e $K$ é o coeficiente de absorção de luz ajustado pelo corante de matização). Faixa típica para $75\text{ g/m}^2$: **$90,0\text{–}93,5\%$**.
11. **Absorção de Água $\text{Cobb}_{60}$ (`LAB-1211`, ISO 535 / TAPPI T 441):** Massa de água ($\text{g/m}^2$) absorvida por $100\text{ cm}^2$ da superfície do papel exposta a uma coluna de $10\text{ mm}$ de água deionizada durante $60\text{ s}$ (sendo $45\text{ s}$ de contato antes de escorrer e passar o mata-borrão aos $60\text{ s}$). Faixa típica: **$22\text{–}28\text{ g/m}^2$** em ambos os lados.
12. **Encanoamento / *Curl* (`LAB-1212`, ISO 11556 / TAPPI T 520):** Medida da flecha (em $\text{mm}$) ou curvatura recíproca ($\text{m}^{-1}$) de folhas A4 antes e após passagem simples e duplex em copiadora xerográfica padronizada. Alvo: **$0 \pm 8\text{ mm}$** (folha perfeitamente plana).

### 12.2 Tabela de Variáveis de Laboratório — Seção 12 (ISA-5.1)

| Propriedade / Ensaio | Código / TAG | Unidade | Faixa Típica (75 g/m²) | Norma de Ensaio | Instrumento de Laboratório | Frequência | Variável de Processo para Correção (MV) | Confiança |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1. Gramatura Condicionada | `LAB-1201` | $\text{g/m}^2$ | $73,5\text{–}76,5$ (Alvo: $75,0$) | ISO 536 / TAPPI T 410 | Módulo gravimétrico L&W Autoline / Balança | A cada bobina mãe ($\sim 45\text{ min}$) | Válvula de Massa (`FV-105`) / Offset QCS (`AIC-902`) | Alta |
| 2. Umidade de Estufa | `LAB-1202` | $\%$ | $4,3\text{–}5,3$ (Alvo: $4,8$) | ISO 287 / TAPPI T 412 | Estufa $105\text{ }^\circ\text{C}$ / Balança termogravimétrica | $1\text{x por turno}$ (auditoria QCS) | Vapor da pós-secagem (`PIC-701`) / Offset `AIC-903` | Alta |
| 3. Espessura (*Caliper*) e *Bulk* | `LAB-1203` | $\mu\text{m}$ ($\text{cm}^3\text{/g}$) | $98\text{–}106\text{ }\mu\text{m}$ ($1,36\text{ cm}^3\text{/g}$) | ISO 534 / TAPPI T 411 | Micrômetro motorizado ($100\text{ kPa}$) | A cada bobina mãe ($\sim 45\text{ min}$) | Carga linear da calandra *soft* (`WIC-801`) | Alta |
| 4. Rugosidade Bendtsen (Topo/Tela) | `LAB-1204` | $\text{mL/min}$ | $120\text{–}200$ (Alvo: $160$) | ISO 8791-2 | Rugosímetro Bendtsen automático | A cada bobina mãe ($\sim 45\text{ min}$) | Carga (`WIC-801`) e Temperatura (`TIC-802`) da calandra | Alta |
| 5. Porosidade Gurley (Permeância) | `LAB-1205` | $\text{s/100mL}$ | $12\text{–}24$ (Alvo: $16$) | ISO 5636-5 / TAPPI T 460 | Porosímetro Gurley / Módulo de permeância | A cada bobina mãe ($\sim 45\text{ min}$) | Potência de refinação (`JIC-101`) e amido no *film press* | Alta |
| 6. Resistência à Tração MD / CD | `LAB-1206` | $\text{kN/m}$ | $5,2\text{ MD}$ / $2,4\text{ CD}$ | ISO 1924-2 / TAPPI T 494 | Dinamômetro de tração horizontal | A cada $1\text{–}2$ bobinas ($\sim 60\text{ min}$) | Refinação (`JIC-101`), Jato/Tela (`XHIC-202`), Amido (`FIC-108`) | Alta |
| 7. Resistência ao Rasgo Elmendorf | `LAB-1207` | $\text{mN}$ | $480\text{ MD}$ / $560\text{ CD}$ | ISO 1974 / TAPPI T 414 | Pêndulo de rasgo Elmendorf digital | $2\text{x por turno}$ ($\sim 4\text{ h}$) | Intensidade de refinação (`JIC-101`) e receita de fibras | Alta |
| 8. Teor de Cinzas ($525\text{ }^\circ\text{C}$) | `LAB-1208` | $\%$ | $19,0\text{–}23,0$ (Alvo: $21,0$) | ISO 1762 / TAPPI T 211 | Mufla a $525\text{ }^\circ\text{C}$ / Analisador TGA | $2\text{x por turno}$ ($\sim 4\text{ h}$) | Dosagem de PCC (`FIC-106`) / Calibração `AIC-904` | Alta |
| 9. Alvura ISO / Brancura CIE | `LAB-1209` | $\% \text{ ISO} / \text{CIE}$ | $99\% \text{ ISO} / 162\text{ CIE}$ | ISO 2470-1 / ISO 11475 | Espectrofotômetro Elrepho (D65/$10^\circ$) | A cada bobina mãe ($\sim 45\text{ min}$) | Dosagem de OBA (`FIC-110`) e corantes de matização | Alta |
| 10. Opacidade Difusa | `LAB-1210` | $\%$ | $90,0\text{–}93,5$ (Alvo: $91,5$) | ISO 2471 / TAPPI T 425 | Espectrofotômetro Elrepho ($R_0 / R_\infty$) | A cada bobina mãe ($\sim 45\text{ min}$) | Dosagem de PCC (`FIC-106`), corante e calandra (`WIC-801`) | Alta |
| 11. Absorção de Água $\text{Cobb}_{60}$ | `LAB-1211` | $\text{g/m}^2$ | $22,0\text{–}28,0$ (Alvo: $25,0$) | ISO 535 / TAPPI T 441 | Anel Cobb $100\text{ cm}^2$ + rolo $10\text{ kg}$ + balança | A cada bobina mãe ($\sim 45\text{ min}$) | Dosagem de cola AKD/ASA (`FIC-107`) e aditivo superficial | Alta |
| 12. Encanoamento (*Curl*) A4 | `LAB-1212` | $\text{mm}$ | $-10\text{ a }+10$ (Alvo: $0$) | ISO 11556 / TAPPI T 520 | Gabarito ISO 11556 + copiadora de teste | A cada $1\text{–}2$ bobinas ($\sim 60\text{ min}$) | Diferencial de vapor pós-secagem (`PDIC-702`) e barras (`PIC-604`) | Alta |

---

## 13. Tópicos Transversais de Operação e Engenharia

### 13.1 Quebra de Folha (*Sheet Breaks*)

Quando uma trinca supera a tenacidade à fratura da folha úmida ou seca, a folha inteira de $8,0\text{ m}$ rompe-se transversalmente em $< 0,2\text{ s}$. Os sensores ópticos/infravermelhos de quebra acionam as facas de corte na mesa (*trim squirt* / *knock-off shower*), enviam toda a produção para o desagregador correspondente, colocam o vapor da secagem em modo de espera (*Sheet-Break Standby*, reduzindo a pressão de vapor em $35\text{–}50\%$ para não superaquecer os cilindros sem folha) e abrem o nip do *film press* e da calandra.

| Seção da Máquina | % Típico das Quebras | Causas Físicas Típicas | Sinais Precursores no Monitoramento | Tempo Médio de Reengate (*Tail Threading*) |
| :--- | :--- | :--- | :--- | :--- |
| **Saída da Prensa $\rightarrow$ 1º Grupo de Secagem** | $35\text{–}45\%$ | Queda de sequidade no *couch* ou prensa; grumo de fibra/carbonato desprendendo da faca do rolo central; variação na química de descolamento do rolo central | Oscilação do ângulo de descolamento (*take-off angle*) medida por câmera/laser, aumento do *draw* `SDIC-406`, queda do vácuo `PIC-305` | **$8\text{ a }14\text{ min}$** (reengate completo desde o *pick-up*) |
| **Colagem Superficial (*Film Press*) $\rightarrow$ Pós-Secagem** | $30\text{–}40\%$ | Furo (*hole*) ou trinca de borda vindo da folha base que abre sob a pressão hidráulica do nip úmido de amido; gota de amido seco; *misting* ou colagem no 1º cilindro pós-prensa | Detecção de furos/manchas no *Web Inspection System* (WIS) antes do *film press*, queda de temperatura do amido `TIC-603`, umidade alta `AIC-901 > 6,5%` | **$6\text{ a }10\text{ min}$** (corte de fita antes do *film press* e passagem automática por cordas/ar) |
| **Calandra *Soft* e Enroladeira *Pope*** | $15\text{–}25\%$ | Borda seca/quebradiça por linha de zero alta na capota; ruga entrando na calandra; falha de troca automática de bobina (*turn-up miss*) | Umidade nas bordas do perfil CD $< 3,5\%$, oscilação da tração `TIC-1002`, erro de velocidade no carretel novo | **$4\text{ a }8\text{ min}$** (passagem rápida apenas na parte seca final) |

- **Impacto Direto em Produção:** A $45,0\text{ t/h}$ ($0,75\text{ t/min}$), uma única quebra com duração total de **$12\text{ min}$** (incluindo reengate da fita, abertura para largura total e estabilização do QCS) representa **$9,0\text{ toneladas}$ de papel que deixam de virar bobina vendável** e retornam ao *broke*, além de $\sim 2,5\text{ MWh}$ de vapor e energia elétrica consumidos sem gerar produto acabado.

### 13.2 Troca Automática de Gramatura (*Automatic Grade Change* — AGC)

Em uma máquina *cut-size*, as transições mais comuns são entre **$70\text{ g/m}^2 \leftrightarrow 75\text{ g/m}^2 \leftrightarrow 80\text{ g/m}^2 \leftrightarrow 90\text{ g/m}^2$**. Fazer essa transição manualmente variável por variável levaria $20\text{–}30\text{ min}$. O pacote de **Troca Automática de Gramatura (AGC)** do QCS executa uma rampa coordenada no tempo compensando os atrasos de transporte entre a parte úmida e a enroladeira:

1. **Sequência Coordenada (Ex.: Subida de $75,0\text{ g/m}^2$ para $80,0\text{ g/m}^2$, $+6,67\%$):**
   - **Passo $t = 0\text{ s}$ (Início no *Turn-up* da bobina anterior):** O AGC congela as malhas CD e inicia simultaneamente:
     - **Redução em rampa da Velocidade da Máquina (`SIC-1104`)** de $1.250\text{ m/min}$ para $1.200\text{ m/min}$ ($-4,0\%$, mantendo a taxa de produção em $\text{t/h}$ e a carga evaporativa de secagem quase constantes!).
     - **Recálculo quadrático imediato da Pressão da Caixa de Entrada (`PIC-201`)** de $225\text{ kPa}$ para $207\text{ kPa}$ acompanhando a velocidade segundo a segundo para manter a relação Jato/Tela (`XHIC-202`) cravada em $1,015$.
     - **Abertura coordenada da Válvula de Massa Grossa (`FIC-105`) e Dosagem de PCC (`FIC-106`)** calculada pelo balanço de massa: $\Delta Q_{massa} = \frac{BW_{novo} \cdot V_{novo}}{BW_{atual} \cdot V_{atual}} - 1 = \frac{80 \cdot 1200}{75 \cdot 1250} - 1 = +2,40\%$.
   - **Passo $t = +15\text{ a }+45\text{ s}$ (Quando o degrau de gramatura chega à Prensa e à Pré-Secagem):** Rampa antecipatória (*feedforward* atrasado pelo tempo morto hidrodinâmico) na pressão de vapor da pré-secagem (`PIC-502`, $+15\text{ a }+25\text{ kPa}$) para secar a folha mais pesada sem deixá-la entrar úmida no *film press*.
   - **Passo $t = +55\text{ a }+75\text{ s}$ (Chegada na Pós-Secagem e Calandra):** Ajuste da pressão de vapor da pós-secagem (`PIC-701`) e da nova referência de espessura na calandra (`AIC-905` passa de $102\text{ }\mu\text{m}$ para $108\text{ }\mu\text{m}$).
2. **Tempo de Estabilização e Bobinas Rebaixadas:** Uma troca AGC bem sintonizada de $75 \rightarrow 80\text{ g/m}^2$ entra na janela de especificação comercial ($\pm 1,5\text{ g/m}^2$ e $\pm 0,3\%$ de umidade) em **$3\text{ a }6\text{ minutos}$**. Como a troca é disparada exatamente no início de um carretel novo, apenas os primeiros $3.500\text{–}7.000\text{ m}$ ficam fora de especificação (ou faz-se um corte de carretel curto de transição — *baby reel* — que é enviado ao *pulper* da enroladeira, evitando rebaixar uma bobina mãe inteira de $45\text{ t}$).

### 13.3 Indicadores de Produção (KPIs de Fábrica e Fórmulas para o Gêmeo Digital)

1. **Produção Bruta Instantânea na Enroladeira ($\dot{m}_{bruta}$, em $\text{t/h}$):**
   $$\dot{m}_{bruta} = \frac{BW \text{ [g/m}^2\text{]} \times W_{util} \text{ [m]} \times V_{enroladeira} \text{ [m/min]} \times 60}{10^6}$$
   *Exemplo de referência:* Para $BW = 75,0\text{ g/m}^2$, $W_{util} = 8,00\text{ m}$ e $V = 1.250\text{ m/min}$:
   $$\dot{m}_{bruta} = \frac{75,0 \times 8,00 \times 1.250 \times 60}{1.000.000} = \mathbf{45,00\text{ t/h}} \quad (\text{ou } \mathbf{360,0\text{ t por turno de 8 h}} \text{ a } 100\%\text{ de eficiência})$$
2. **Eficiência de Tempo da Máquina (*Time Efficiency*, $\eta_{tempo}$):**
   $$\eta_{tempo} = \frac{T_{calendario} - T_{paradas\_programadas} - T_{quebras\_e\_indisponibilidades}}{T_{calendario} - T_{paradas\_programadas}} = \frac{T_{papel\_na\_enroladeira}}{T_{operacional\_disponivel}} \times 100\%$$
   Faixa típica de classe mundial (*benchmark*): **$91,0\text{ a }95,0\%$** (ou seja, perda por quebras e limpeza de $4\text{ a }7\%$ do tempo e $1\text{ a }2\%$ de paradas corretivas).
3. **Eficiência Material / Perda de Acabamento e Refugo (*Material Efficiency*, $\eta_{mat}$):**
   $$\eta_{mat} = \frac{M_{bobinas\_aprovadas\_expedidas}}{M_{bruta\_enrolada\_na\_Pope}} \times 100\% = \left(1 - \text{Taxa de Refugo Seco}\right) \times 100\%$$
   Desconta as perdas de topo/fundo de bobina mãe (*slab-off* e *spool bottom loss*), refile lateral na rebobinadeira/cortadeira e bobinas rebaixadas por qualidade. Faixa típica: **$92,0\text{ a }95,5\%$**.
4. **Eficiência Global da Máquina (OEE / *Overall Machine Efficiency*):**
   $$\text{OEE} = \eta_{disponibilidade} \times \eta_{velocidade} \times \eta_{qualidade}$$
   Em máquinas modernas de papel UWF, o OEE anual típico situa-se entre **$83\%\text{ e }89\%$**, entregando uma produção líquida vendável real de **$38,0\text{ a }40,5\text{ t/h}$** ($\sim 305\text{ a }325\text{ t/turno de 8 h}$, ou $\sim 330.000\text{ a }355.000\text{ t/ano}$).

### 13.4 Manutenção Preditiva e Monitoramento de Condição de Ativos

Uma máquina de $8\text{ m}$ rodando a $1.250\text{ m/min}$ possui cerca de $300\text{ a }450$ mancais de grande porte. A parada imprevista por travamento de um rolamento de cilindro secador ou rolo de prensa custa $12\text{ a }36\text{ horas}$ de produção perdida ($540\text{ a }1.600\text{ toneladas}$).

1. **Análise de Vibração Global (Norma ISO 20816-3) e Envelope de Aceleração ($gE$):**
   Para máquinas industriais de grande porte ($> 300\text{ kW}$, rotação $120\text{ a }15.000\text{ rpm}$), a **ISO 20816-3** classifica a velocidade global de vibração RMS ($10\text{–}1.000\text{ Hz}$) medida na caixa de mancal:
   - **Zona A (Máquina nova / excelente):** $< 2,3\text{ mm/s RMS}$ (base rígida) ou $< 3,5\text{ mm/s RMS}$ (base flexível).
   - **Zona B (Operação contínua irrestrita):** $2,3\text{ a }4,5\text{ mm/s RMS}$ (rígida) ou $3,5\text{ a }7,1\text{ mm/s RMS}$ (flexível).
   - **Zona C (Alerta — inspecionar e programar intervenção na próxima parada):** **$4,5\text{ a }7,1\text{ mm/s RMS}$** (rígida) ou $7,1\text{ a }11,0\text{ mm/s RMS}$ (flexível).
   - **Zona D (Perigo — dano severo em curso):** **$> 7,1\text{ mm/s RMS}$** (rígida) ou $> 11,0\text{ mm/s RMS}$ (flexível).
   - **Limitação em Baixa Rotação e Uso do Envelope de Alta Frequência ($gE$):** Um cilindro secador de $\varnothing = 1,83\text{ m}$ a $1.250\text{ m/min}$ gira a apenas **$f_r = \frac{1250}{\pi \cdot 1,83} = 217,4\text{ rpm} = 3,62\text{ Hz}$**! Nessa rotação baixa, um defeito incipiente de descamação (*spalling*) na pista de um rolamento autocompensador de rolos gera impactos curtos de alta frequência que quase não elevam a velocidade RMS global, mas aparecem nitidamente na **Demodulação de Envelope de Aceleração ($gE$, banda de filtragem $500\text{–}10.000\text{ Hz}$)** nas **4 Frequências Características de Defeito de Rolamento**:
     $$\text{BPFO (Pista Externa)} = \frac{N_b}{2} f_r \left(1 - \frac{d}{D_p}\cos\beta\right)$$
     $$\text{BPFI (Pista Interna)} = \frac{N_b}{2} f_r \left(1 + \frac{d}{D_p}\cos\beta\right)$$
     $$\text{BSF (Elemento Rolante)} = \frac{D_p}{2d} f_r \left[1 - \left(\frac{d}{D_p}\cos\beta\right)^2\right]$$
     $$\text{FTF (Gaiola Fundamental)} = \frac{1}{2} f_r \left(1 - \frac{d}{D_p}\cos\beta\right)$$
     onde $N_b$ é o número de rolos, $f_r$ é a frequência de rotação do eixo ($\text{Hz}$), $d$ é o diâmetro do rolo, $D_p$ é o diâmetro primitivo e $\beta$ é o ângulo de contato.
2. **Temperatura de Mancal, Termografia Infravermelha e Análise de Óleo:**
   - **Temperatura de Mancais:** Monitorada por Pt100 nos mancais críticos das prensas, calandra e redutores (normal $55\text{–}70\text{ }^\circ\text{C}$, Alerta `H = 80 °C`, Perigo `HH = 90 °C`).
   - **Termografia Infravermelha:** Usada mensalmente em painéis elétricos/CCMs e no perfil transversal das telas, feltros, cilindros secadores (identifica cilindros alagados mais frios em $15\text{–}25\text{ }^\circ\text{C}$) e capa polimérica do rolo da calandra *soft*.
   - **Análise de Óleo Lubrificante:** Contagem de partículas **ISO 4406** (meta `15/13/10` ou `16/14/11`), teor de água por titulação **Karl Fischer** (limite máximo $< 200\text{–}300\text{ ppm}$ em serviço; acima de $500\text{ ppm}$ reduz a vida de fadiga $L_{10}$ do rolamento em mais de $50\%$), viscosidade cinemática a $40\text{ }^\circ\text{C}$ e espectrometria ICP de metais de desgaste ($\text{Fe, Cu, Cr, Sn}$).

### 13.5 Rotina Operacional de Turno (*Shift Operations*)

A equipe operacional típica por turno é composta por 1 Operador de Sala de Controle (Painel SDCD/QCS), 1 Operador de Parte Úmida (Condutor), 1 Operador de Parte Seca / Calandra / Enroladeira, 1 Auxiliar de Enroladeira/Ponte Rolante e 1 Analista de Qualidade:
1. **Passagem de Turno Padronizada ($15\text{ min}$ na troca de turno):** Revisão no historiador (PI Vision) e no QCS da gramatura em curso, número de quebras do turno anterior e causas-raiz, campanha em dias das vestimentas (telas formadoras: vida típica $35\text{–}55\text{ dias}$; feltros de prensa: $28\text{–}42\text{ dias}$; camisa da prensa de sapata: $120\text{–}180\text{ dias}$; telas secadoras: $8\text{–}14\text{ meses}$; barras do *film press*: $7\text{–}14\text{ dias}$), desvios $2\sigma$ CD, alarmes ativos (*shelved/standing alarms*) e pendências de segurança/bloqueio LOTO.
2. **Ronda Estruturada de Inspeção de Campo (1x a cada $2\text{–}4\text{ horas}$, Lado Operador DS e Lado Acionamento TS):**
   - Verificação visual da linha seca (*dry line*) na seção de formação e limpeza dos bicos dos chuveiros oscilantes de telas e feltros.
   - Inspeção das facas raspadoras (*doctor blades*) do rolo central da prensa, 1º grupo secador e calandra (verificando ausência de grumos ou faíscas).
   - Verificação visual dos cabeçotes do *film press* (ausência de vazamento nas vedações de borda, espuma ou estrias de barra).
   - Conferência no corredor do Lado Acionamento (TS) de vazamentos de vapor nas juntas rotativas e fluxo nos visores/rotâmetros de óleo dos mancais (`FIC-1105`).
3. **Registro de Quebras e Notas de Manutenção:** Toda quebra de folha gera automaticamente um evento (*Event Frame* no AVEVA PI System) que captura os $10\text{ min}$ anteriores de todas as variáveis rápidas e imagens das câmeras de monitoramento de quebra (*Web Monitoring System* — WMS), exigindo que o operador classifique o código de causa (Mecânica, Elétrica, Instrumentação, Química/Processo ou Vestimenta) e abra Nota de Manutenção no ERP (SAP PM) para qualquer anomalia encontrada na ronda.

---

## 14. As 15 Relações Causa-Efeito Mais Importantes para o Simulador do Gêmeo Digital

A tabela abaixo parametriza as 15 funções de transferência fundamentais do processo no formato de **1ª Ordem com Tempo Morto (FOPDT)**:
$$G(s) = \frac{\Delta Y(s)}{\Delta U(s)} = \frac{K_p \cdot e^{-\theta_d s}}{\tau s + 1}$$
onde $\Delta U$ é o degrau aplicado na variável de entrada/manipulada, $\Delta Y = K_p \cdot \Delta U$ é a variação estacionária resultante na variável de saída (em malha aberta, mantendo as demais entradas constantes), $\theta_d$ é o atraso puro de transporte (*dead time*, em segundos) e $\tau$ é a constante de tempo dominante ($63,2\%$ da resposta, em segundos) para a máquina de referência ($75\text{ g/m}^2$ a $1.250\text{ m/min}$).

| # | Variável de Entrada / Perturbação ($\Delta U$) | Variável Afetada ($\Delta Y$) | Sentido e Ordem de Grandeza ($\Delta Y$ para o degrau $\Delta U$) | Tempo Morto ($\theta_d$) | Constante de Tempo ($\tau$) | Mecanismo Físico / Químico Subjacente |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | **$+10\text{ m}^3\text{/h}$** na Vazão de Massa Grossa (`FIC-105`, $\approx +1,09\%$) | Gramatura Seca (`AIC-902`) e Umidade Final (`AIC-903`) | **$+0,80\text{ a }+0,85\text{ g/m}^2$** na Gramatura Seca e **$+0,15\text{ a }+0,22\%$** na Umidade Final | $\theta_d \approx 65\text{–}85\text{ s}$ | $\tau \approx 18\text{–}28\text{ s}$ | Aumento direto do aporte de fibra seca para o silo; a manta mais pesada carrega mais água através das prensas e exige mais calor na secagem |
| **2** | **$+0,10\%$** na Consistência da Massa Grossa (`AIC-104`, de $3,50\%$ para $3,60\%$) | Gramatura Seca na Enroladeira (`AIC-902`, sem correção FF) | **$+2,1\text{ a }+2,2\text{ g/m}^2$** na Gramatura Seca ($+2,86\%$ de fibra para a mesma vazão volumétrica) | $\theta_d \approx 70\text{–}90\text{ s}$ | $\tau \approx 20\text{–}30\text{ s}$ | A válvula de gramatura é volumétrica; sem compensação pela leitura de consistência, a vazão mássica de fibra seca cresce proporcionalmente |
| **3** | **$+10\text{ m/min}$** na Velocidade da Máquina (`SIC-1104`, $+0,80\%$ sem FF) | Gramatura Seca (`AIC-902`) e Umidade Final (`AIC-903`) | **$-0,58\text{ a }-0,62\text{ g/m}^2$** na Gramatura Seca e **$+0,20\text{ a }+0,30\%$** na Umidade Final | $\theta_d \approx 5\text{–}15\text{ s}$ (efeito elástico/secagem) | $\tau \approx 25\text{–}40\text{ s}$ | A mesma vazão mássica de fibra/hora é espalhada sobre uma área de tela $+0,8\%$ maior por minuto, enquanto o tempo de residência nos secadores e no nip da prensa cai |
| **4** | **$+10\text{ kPa}$** na Pressão de Vapor dos Grupos Principais da Pré-Secagem (`PIC-502`) | Umidade antes do *Film Press* (`AIC-901`) | **$-0,22\text{ a }-0,32\%$** na Umidade Pré-Colagem | $\theta_d \approx 15\text{–}25\text{ s}$ | $\tau \approx 45\text{–}70\text{ s}$ | Eleva a temperatura de saturação interna dos cilindros ($\sim +1,8\text{ }^\circ\text{C}$ a $230\text{ kPa}$), aumentando o fluxo de calor condutivo através da parede de ferro fundido |
| **5** | **$+10\text{ kPa}$** na Pressão de Vapor da Pós-Secagem (`PIC-701`) | Umidade Final na Enroladeira (`AIC-903`) | **$-0,15\text{ a }-0,25\%$** na Umidade Final | $\theta_d \approx 10\text{–}18\text{ s}$ | $\tau \approx 35\text{–}55\text{ s}$ | Aumenta a taxa de evaporação nos cilindros pós-colagem na fase de taxa decrescente |
| **6** | **$+50\text{ kN/m}$** na Carga Linear da Prensa de Sapata (`WIC-401`, ex.: $850 \rightarrow 900\text{ kN/m}$) | Sequidade Pós-Prensa (`AI-407`), Umidade Pré-Colagem (`AIC-901`) e Espessura (`AIC-905`) | **$+0,35\text{ a }+0,50\%$** na Sequidade Pós-Prensa, **$-0,6\text{ a }-0,9\%$** em `AIC-901` e **$-1,0\text{ a }-1,6\text{ }\mu\text{m}$** na Espessura | $\theta_d \approx 25\text{–}35\text{ s}$ | $\tau \approx 10\text{–}15\text{ s}$ | Aumenta o impulso mecânico de prensagem ($I_p = W/V$), expulsando mais água livre na prensa e densificando permanentemente a folha úmida |
| **7** | **$+10\text{ kg/t}$** na Dosagem de Carga Mineral PCC (`FIC-106`) | Teor de Cinzas (`AIC-904`), Opacidade (`AI-907`) e Tração MD (`LAB-1206`) | **$+0,65\text{ a }+0,80\%$** nas Cinzas do Papel, **$+0,35\text{ a }+0,50\%$** na Opacidade e **$-0,15\text{ a }-0,22\text{ kN/m}$** na Tração MD | $\theta_d \approx 60\text{–}80\text{ s}$ | $\tau \approx 40\text{–}65\text{ s}$ (reciclo da água branca) | Parte do PCC retém-se na 1ª passagem ($\text{FPAR} \approx 58\%$) e o restante recircula no silo até atingir novo equilíbrio; partículas minerais espalham luz mas interrompem ligações fibra-fibra |
| **8** | **$+50\text{ g/t}$** na Dosagem de Polímero de Retenção CPAM (`FIC-109`) | Consistência da Água Branca (`AIC-306`), Retenção FPR e Cinzas (`AIC-904`) | **$-0,025\text{ a }-0,040\%$** em `AIC-306` ($\text{FPR}$ sobe **$+3,0\text{ a }+4,5\%$**) e **$+0,4\text{ a }+0,7\%$** nas Cinzas (transitório) | $\theta_d \approx 20\text{–}35\text{ s}$ | $\tau \approx 30\text{–}50\text{ s}$ | Aumenta a floculação de finos e PCC sobre as fibras na mesa formadora, reduzindo a passagem de sólidos através da tela para o silo |
| **9** | **$+10\text{ kWh/t}$** na Potência Específica de Refinação (`JIC-101`) | Grau de Refino (`AIC-102`), Porosidade Gurley (`LAB-1205`) e Tração MD (`LAB-1206`) | **$+2,5\text{ a }+3,5\text{ }^\circ\text{SR}$**, **$+3,0\text{ a }+4,5\text{ s/100mL}$** no Gurley (papel mais fechado) e **$+0,35\text{ a }+0,50\text{ kN/m}$** na Tração MD | $\theta_d \approx 180\text{–}360\text{ s}$ (tempo de residência nos tanques) | $\tau \approx 300\text{–}600\text{ s}$ | Aumenta a fibrilação externa/interna das fibras BHKP, fechando a rede porosa, elevando o vácuo no *couch* (`PIC-305` sobe $3\text{–}5\text{ kPa}$) e aumentando a área ligada |
| **10** | **$+0,02$** na Relação Jato/Tela (`XHIC-202`, ex.: de $1,00$ para $1,02$) | Razão de Tração MD/CD (`LAB-1206`) e Formação | **$+0,18\text{ a }+0,28$** na Razão MD/CD (sobe Tração MD e cai Tração CD) | $\theta_d \approx 55\text{–}70\text{ s}$ | $\tau \approx 5\text{–}10\text{ s}$ | O excesso de velocidade do jato ($\Delta V = +25\text{ m/min}$) gera cisalhamento direcional no impacto com as telas, alinhando os eixos das fibras no sentido MD |
| **11** | **$+10\%$** de abertura em uma Válvula de Diluição CD (`ZIC-205[k]`) | Gramatura Seca Local na Zona Mapeada (`AIC-902[k]`) | **$-0,65\text{ a }-0,95\text{ g/m}^2$** na faixa correspondente (com espalhamento lateral Gaussiano de $\sigma \approx 45\text{ mm}$) | $\theta_d \approx 55\text{–}70\text{ s}$ (+1 scan do QCS) | $\tau \approx 8\text{–}15\text{ s}$ | Injeta mais água branca clarificada ($0,08\%$) na zona $k$, diluindo localmente a consistência da suspensão de $0,85\%$ para $\sim 0,84\%$ sem alterar a velocidade do jato |
| **12** | **$+1,0\%$** no Teor de Sólidos do Amido no *Film Press* (`AIC-601`, de $9,5\%$ para $10,5\%$) | Aplicação Seca de Amido (*Pick-up*) e Umidade Final (`AIC-903`) | **$+0,35\text{ a }+0,45\text{ g/m}^2$** de amido seco total e **$-0,30\text{ a }-0,45\%$** na Umidade Final (a vapor constante) | $\theta_d \approx 18\text{–}28\text{ s}$ | $\tau \approx 20\text{–}35\text{ s}$ | Para o mesmo volume de filme úmido dosado pelas ranhuras da barra, entra mais amido sólido e menos água livre na folha, reduzindo a carga evaporativa da pós-secagem |
| **13** | **$+0,5\text{ bar}$** na Pressão da Mangueira da Barra Dosadora (`PIC-604`, de $1,5$ para $2,0\text{ bar}$) | Aplicação de Amido naquela Face e Umidade Final (`AIC-903`) | **$-0,15\text{ a }-0,25\text{ g/m}^2$** de amido seco no lado correspondente e **$-0,20\text{ a }-0,35\%$** na Umidade Final | $\theta_d \approx 18\text{–}25\text{ s}$ | $\tau \approx 5\text{–}10\text{ s}$ | Maior aperto pneumático da barra contra o rolo aplicador reduz a espessura hidrodinâmica do filme úmido pré-dosado no rolo |
| **14** | **$+20\text{ kN/m}$** na Carga Linear da Calandra *Soft* (`WIC-801`, de $100$ para $120\text{ kN/m}$) | Espessura (`AIC-905`), Rugosidade Bendtsen (`LAB-1204`) e Opacidade (`AI-907`) | **$-1,8\text{ a }-2,6\text{ }\mu\text{m}$** na Espessura, **$-15\text{ a }-25\text{ mL/min}$** na Rugosidade Bendtsen (mais liso) e **$-0,2\text{ a }-0,4\%$** na Opacidade | $\theta_d \approx 4\text{–}8\text{ s}$ | $\tau \approx 3\text{–}6\text{ s}$ | Compressão termomecânica no nip elástico achata as asperezas superficiais e reduz o volume de poros internos |
| **15** | **$+20\text{ kPa}$** no Diferencial de Vapor Topo vs. Fundo na Pós-Secagem (`PDIC-702`) | Encanoamento (*Curl* `LAB-1212`) | **$-3,5\text{ a }-5,5\text{ mm}$** na flecha de *Curl* (desloca a curvatura em direção ao lado que seca por último) | $\theta_d \approx 12\text{–}20\text{ s}$ | $\tau \approx 40\text{–}60\text{ s}$ | Altera a simetria da taxa de secagem entre a face superior e inferior na fase final, mudando o gradiente de tensão de encolhimento na espessura ($z$) |

---

## 15. Glossário Técnico de Chão de Fábrica (PT-BR $\leftrightarrow$ EN)

| Termo em Português (Chão de Fábrica Brasil) | Termo Técnico em Inglês (Internacional / OEM) | Significado Prático na Máquina de Papel |
| :--- | :--- | :--- |
| **Água Branca (Rasa / Rica e Clarificada)** | *White Water (Rich / Tray WW & Clarified WW)* | Água drenada na seção de formação contendo finos, carga mineral (PCC) e aditivos químicos dissolvidos |
| **Alagamento de Cilindro Secador** | *Dryer Cylinder Flooding* | Perda de extração pelo sifão (baixo $\Delta P$ ou falha mecânica), acumulando água dentro do cilindro secador |
| **Alvura ISO / Brancura CIE** | *ISO Brightness / CIE Whiteness* | Refletância difusa a $457\text{ nm}$ (Alvura) e percepção espectral completa sob luz solar D65 (Brancura CIE) |
| **Arrancamento / Pelagem** | *Picking / Blistering / Delamination* | Arrancamento de fibras da superfície da folha nos primeiros cilindros secadores ou na impressão offset |
| **Barra Dosadora Ranurada** | *Grooved Metering Rod* | Haste de aço inox cromado com micro-ranhuras helicoidais que dosa o filme de amido no *Film Press* |
| **Bobina Mãe / Bobina Jumbo** | *Parent Roll / Jumbo Roll / Master Roll* | Bobina de largura total ($8,0\text{ m}$) e grande diâmetro ($\sim 2,8\text{ m}$, $45\text{ t}$) formada na enroladeira *Pope* |
| **Bolsão de Secagem** | *Dryer Pocket* | Espaço triangular confinado entre os cilindros secadores, a folha de papel e a tela secadora |
| **Caixa de Entrada com Diluição** | *Dilution Control Hydraulic Headbox* | Caixa de entrada que corrige o perfil transversal (CD) de gramatura injetando água branca por zona |
| **Caixa Planas / Caixas de Alto Vácuo** | *Flat Boxes / High-Vacuum Suction Boxes* | Caixas de sucção com tampas cerâmicas no final da formação onde o ar atravessa a folha |
| **Caixa *Uhle* (Caixa de Sucção de Feltro)** | *Uhle Box / Felt Suction Box* | Caixa de vácuo com fenda de cerâmica/polietileno que desidrata e limpa os feltros prensadores |
| **Calandra Macia (*Soft*)** | *Soft Nip Calender* | Calandra com nip formado entre um cilindro metálico aquecido e um rolo revestido com polímero elástico |
| **Calombo / Corda na Bobina** | *Hard Streak / Rope Mark / Ridge* | Faixa circunferencial alta e dura na bobina mãe causada por sobre-espessura localizada no perfil CD |
| **Camisa / Manta da Prensa de Sapata** | *Shoe Press Sleeve / Belt* | Camisa tubular flexível e impermeável de poliuretano ranurado que gira sobre a sapata estacionária |
| **Capota Fechada e Linha de Zero** | *Closed Dryer Hood & Zero Pressure Line* | Clausura isolada da secagem onde a altura de pressão manométrica zero evita fugas ou infiltrações |
| **Carretel / Estaleiro da Enroladeira** | *Reel Spool / Tambour* | Eixo metálico pesado sobre o qual a folha é enrolada na enroladeira *Pope* |
| **Circuito Curto / Circuito de Cabeça** | *Short Circulation / Approach Flow System* | Malha hidráulica fechada entre o silo de água branca, *fan pump*, *cleaners*, *Deculator*, *screens* e caixa de entrada |
| **Colagem Interna e Colagem Superficial** | *Internal Sizing & Surface Sizing* | Hidrofobização na massa (AKD/ASA) e aplicação superficial de filme de amido (*Film Press*) |
| **Direção da Máquina (MD) / Transversal (CD)** | *Machine Direction (MD) / Cross Direction (CD)* | Sentido longitudinal do fluxo do papel (MD) e sentido da largura de $8\text{ m}$ da máquina (CD) |
| **Dupla Face / Desigualdade Topo-Tela** | *Two-Sidedness* | Diferença de lisura, alvura, cinzas ou absorção entre o Lado Superior (*Top Side*) e o Lado Tela (*Wire Side*) |
| **Encanoamento** | *Curl (MD, CD, Diagonal Curl)* | Tendência da folha A4 de curvar-se formando um cilindro devido a assimetrias estruturais ou de secagem |
| **Enroladeira *Pope*** | *Pope Reel / Drum Reel* | Enroladeira contínua onde o carretel é pressionado contra um cilindro tambor acionado (*Pope Drum*) |
| **Estiramento / *Draw* (Passe Aberto)** | *Speed Draw / Open Draw* | Diferença percentual de velocidade entre duas seções consecutivas para tensionar e descolar a folha |
| **Faca Raspadora** | *Doctor Blade* | Lâmina de fibra de carbono, aço ou composto apoiada contra rolos/cilindros para limpeza e descarte na quebra |
| **Formador de Duas Telas (*Gap Former*)** | *Gap Former / Twin-Wire Former* | Seção de formação onde o jato da caixa de entrada entra diretamente entre duas telas convergentes |
| **Fosso do *Couch* / Desagregador Sob Máquina** | *Couch Pit / Under-Machine Pulper* | Tanque agitado sob o final da mesa formadora que recebe refiles e toda a manta úmida durante quebras |
| **Lado Operador (LO / DS) e Lado Comando (LC / TS)** | *Drive Side / Tending Side (DS) & Back Side (TS)* | Lado frontal de operação e retirada de amostras (DS) e lado traseiro onde ficam os acionamentos e vapor (TS) |
| **Linha Seca / Linha d'Água** | *Dry Line* | Fronteira visual na seção de formação onde o brilho espelhado de água livre desaparece da superfície da folha |
| **Massa Grossa vs. Massa Magra** | *Thick Stock (~3.5%) vs. Thin Stock (~0.85%)* | Suspensão concentrada antes do silo vs. suspensão diluída que alimenta a caixa de entrada |
| **Passagem de Fita / Reengate** | *Tail Threading* | Operação de conduzir uma tira estreita ($100\text{–}200\text{ mm}$, a "fita") da prensa até a enroladeira após uma quebra |
| **Prensa de Sapata** | *Shoe Press / Extended Nip Press (ENP)* | Prensa hidráulica com sapata côncava longa ($\sim 250\text{ mm}$) que maximiza o impulso de prensagem |
| **Refugo Interno** | *Broke (Wet Broke & Dry Broke)* | Papel descartado dentro da própria fábrica (nas quebras, refiles e perdas de bobina) que é desagregado e reutilizado |
| **Relação Jato/Tela** | *Jet-to-Wire Ratio (Rush / Drag)* | Razão entre a velocidade do jato no lábio da caixa de entrada e a velocidade das telas formadoras |
| **Retenção de Primeira Passagem** | *First-Pass Retention (FPR / FPAR)* | Fração percentual dos sólidos totais (FPR) ou cinzas (FPAR) da caixa de entrada que fica retida na folha úmida |
| **Rolo de Sucção da Mesa (*Couch*)** | *Suction Couch Roll* | Último rolo da seção de formação dotado de caixas internas de vácuo para elevar a sequidade antes do *pick-up* |
| **Troca de Bobina (*Turn-up*)** | *Reel Turn-up* | Transferência automática da folha a plena velocidade da bobina cheia para um carretel vazio |
| **Volume Específico (*Bulk*)** | *Specific Volume / Bulk ($\text{cm}^3\text{/g}$)* | Inverso da densidade aparente da folha ($\text{Espessura em }\mu\text{m} / \text{Gramatura em g/m}^2$); governa a rigidez |

---

## 16. Referências Bibliográficas, Normas Técnicas e Fontes Públicas

1. **Série *Papermaking Science and Technology* (Fapet Oy / Paper Engineers' Association, Finlândia — Editores: Hannu Paulapuro & Johan Gullichsen):**
   - **Book 4:** *Papermaking Chemistry* (Leo Neimo, Ed.) — Química da parte úmida, retenção por micropartículas, colagem alcalina AKD/ASA, PCC e amido catiônico.
   - **Book 8:** *Papermaking Part 1, Stock Preparation and Wet End* (Hannu Paulapuro, Ed.) — Refinação de fibra curta, circuito curto, desaeração (*Deculator*), caixas de entrada com controle de diluição, *Gap Formers* e prensas de sapata (*Shoe Presses*).
   - **Book 9:** *Papermaking Part 2, Drying* (Markku Karlsson, Ed.) — Transferência de calor e massa nos cilindros secadores, sifões estacionários/rotativos, barras de turbulência, sistemas de vapor em cascata, capota fechada, linha de zero e controle de *curl*.
   - **Book 10:** *Papermaking Part 3, Finishing* (Hannu Paulapuro, Ed.) — Calandragem *soft*, mecânica do enrolamento TNT em enroladeiras *Pope* e conversão *cut-size*.
   - **Book 11:** *Pigment Coating and Surface Sizing of Paper* (Esa Lehtinen, Ed.) — Reologia de amido, prensas de filme (*Film Press / SpeedSizer*) e dosagem por barras ranuradas.
   - **Book 14:** *Process Control* (Kauko Leiviskä, Ed.) — Controle MD/CD, separação espaço-temporal de varredura de scanners QCS e controle multivariável de máquinas de papel.
2. **Manuais de Engenharia de Papel e Celulose:**
   - **Smook, Gary A.** *Handbook for Pulp & Paper Technologists* (4th Edition, TAPPI Press) — Balanços de massa, circuito curto, formação, prensagem e secagem.
   - **Biermann, Christopher J.** *Handbook of Pulping and Papermaking* (2nd Edition, Academic Press).
   - **MacDonald, R. G. / Kocurek, M. J.** *Pulp and Paper Manufacture Series* (Joint Textbook Committee of the Paper Industry — TAPPI / CPPA).
3. **Normas Técnicas e Recomendações de Engenharia (TAPPI, ISO, ABNT e ISA):**
   - **TAPPI Technical Information Papers (TIPs):**
     - `TAPPI TIP 0404-47`: *Paper Machine Headbox Slice Velocity and Jet-to-Wire Ratio*.
     - `TAPPI TIP 0404-27`: *Air Flow Requirements for Conditioning Press Felts at Suction Pipes and Vacuum Levels*.
     - `TAPPI TIP 0404-43`: *Dryer Hood Exhaust and Supply Air Balance*.
     - `TAPPI TIP 0404-63`: *Paper Machine Drying Rate and Steam/Condensate Siphon Differential Pressure*.
   - **Normas ISO / TAPPI / ABNT de Ensaios Físicos e Ópticos do Papel:**
     - `ISO 187` / `TAPPI T 402`: Atmosfera padrão para condicionamento e ensaio de papel ($23\text{ }^\circ\text{C}$, $50\%\text{ UR}$).
     - `ISO 536` / `TAPPI T 410` / `ABNT NBR NM ISO 536`: Determinação da gramatura.
     - `ISO 287` / `TAPPI T 412`: Determinação do teor de umidade por secagem em estufa.
     - `ISO 534` / `TAPPI T 411`: Determinação da espessura (*caliper*) e densidade aparente / *bulk*.
     - `ISO 8791-2`: Determinação da rugosidade/lisura pelo método de fuga de ar Bendtsen.
     - `ISO 5636-5` / `TAPPI T 460` (Gurley) e `ISO 5636-3` (Bendtsen): Determinação da permeância ao ar (porosidade).
     - `ISO 1924-2` / `TAPPI T 494`: Determinação das propriedades de resistência à tração.
     - `ISO 1974` / `TAPPI T 414`: Determinação da resistência ao rasgo (método Elmendorf).
     - `ISO 1762` / `TAPPI T 211`: Determinação do resíduo (teor de cinzas) por incineração a $525\text{ }^\circ\text{C}$.
     - `ISO 2470-1` / `TAPPI T 452` (Alvura ISO) e `ISO 11475` (Brancura CIE D65/$10^\circ$).
     - `ISO 2471` / `TAPPI T 425`: Determinação da opacidade por refletância em papel de fundo.
     - `ISO 535` / `TAPPI T 441`: Determinação da capacidade de absorção de água — Método de Cobb.
     - `ISO 11556` / `TAPPI T 520`: Determinação do encanoamento (*curl*) do papel.
   - **Normas de Instrumentação, Controle e Manutenção Preditiva:**
     - `ANSI/ISA-5.1`: *Instrumentation Symbols and Identification*.
     - `ANSI/ISA-18.2`: *Management of Alarm Systems for the Process Industries*.
     - `ANSI/ISA-7.0.01`: *Quality Standard for Instrument Air*.
     - `ISO 20816-3` (substituiu `ISO 10816-3`): *Mechanical vibration — Measurement and evaluation of machine vibration — Part 3: Industrial machines with nominal power above 15 kW*.
     - `ISO 4406`: *Hydraulic fluid power — Fluids — Method for coding the level of contamination by solid particles*.
4. **Literatura Técnica Pública de Fabricantes de Máquinas e Automação (OEMs):**
   - **Voith Paper:** Documentação técnica das linhas *XcelLine*, *MasterJet Pro / ModuleJet* (caixa de entrada e diluição CD), *DuoFormer D* (*gap former*), *Tandem NipcoFlex* (prensa de sapata), *EcoHood*, *SpeedSizer* (colagem superficial por filme), *NipcoMat* (*soft calender*) e *MasterReel*.
   - **Valmet (ex-Metso Paper):** Documentação técnica das linhas *OptiConcept M*, *OptiFiner*, *OptiFlo Gap* com *IQ Dilution*, *OptiFormer Gap*, *OptiPress Center*, *OptiDry / SymRun*, *OptiSizer Film*, *OptiCalender Soft*, *OptiReel* e *Valmet DNA / IQ Quality Control System*.
   - **ABB Pulp & Paper:** Manuais técnicos do *ABB Ability System 800xA*, *ABB Ability Quality Control System (QCS 800xA)*, sensores *AccuRay* (Beta, NIR, Raios-X, Caliper, Color) e *Sectional Drive Systems (ACS880 MultiDrive DTC)*.
   - **Honeywell Process Solutions:** Documentação técnica do *Experion MX QCS*, *ProfiSteam* (caixa de vapor na prensa) e *Caliper Profiler*.
   - **Kadant Johnson & Runtech Systems:** Guias de engenharia de *Dryer Siphons, Stationary Siphons, Spoiler Bars, Rotary Joints, Cascade Steam & Condensate Systems* e *EP Turbo Vacuum Systems*.
