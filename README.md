# ÓRBITA 3D — fotogrametria local

O ÓRBITA usa a câmera para produzir um modelo 3D texturizado. A versão atual
tem dois modos:

- **Fotogrametria real**: COLMAP calcula as posições das câmeras e o OpenMVS
  gera profundidade, nuvem densa, malha e textura. O resultado é um `.GLB` real.
- **Demonstração**: usa uma geometria sintética conhecida apenas para mostrar o
  visualizador. Fotos do usuário nunca usam esse atalho.

A captura possui perfis guiados de 24 vistas para **objetos**, **rostos** e
**corpos inteiros**. Antes da fotogrametria, um modelo de reconhecimento remove
o fundo de cada foto; COLMAP e OpenMVS recebem as máscaras da silhueta para não
transformarem parede, chão ou pedestal em parte do modelo.

COLMAP 4.2.0 e OpenMVS 2.4.0 sem CUDA ficam em `.tools/` e não entram no Git.
Docker e FFmpeg não são necessários. A reconstrução densa usa o processador e
pode levar vários minutos.

## Abrir a versão completa

No PowerShell, na pasta do projeto:

```powershell
npm install
npm run dev:full
```

Abra `http://localhost:3000`. O comando inicia o motor local e a interface.

Para diagnosticar separadamente, mantenha dois PowerShell abertos:

```powershell
.\server\start.ps1
```

```powershell
npm run dev
```

## Captura que funciona para fotogrametria

1. Deixe o objeto completamente imóvel.
2. Caminhe com a câmera ao redor dele; não use uma base giratória com o fundo parado.
3. Faça 24 fotos, cada uma repetindo aproximadamente 70% da vista anterior.
4. Complete uma volta no nível do objeto e acrescente vistas um pouco mais altas.
5. Use luz difusa e evite objetos transparentes, muito brilhantes ou totalmente lisos.

A câmera e o objeto precisam manter foco e exposição constantes. As fotos são
enviadas somente ao serviço que roda neste computador; não há envio para nuvem.

## Pipeline real

1. Captura JPEG em até 1920 px, sem reduzir para a prévia de 384×512.
2. Reconhecimento do assunto e geração das máscaras de silhueta.
3. Extração e correspondência SIFT com máscara no COLMAP.
4. Reconstrução esparsa e correção da lente.
5. Nova máscara nas imagens corrigidas e profundidade no OpenMVS.
6. Reconstrução da malha, atlas de textura e exportação GLB.

Os trabalhos e arquivos temporários ficam em `server/workspaces/`, ignorados
pelo Git. O ambiente Python `server/.venv/` também é local e ignorado.

## Observação sobre celular e HTTPS

O navegador só libera a câmera em `localhost` ou HTTPS. O proxy do Vite envia
`/api` ao motor local, portanto um túnel HTTPS apontado para a porta 3000 também
alcança o serviço enquanto o computador permanecer ligado.

## Deploy na Vercel

A Vercel publica a interface/PWA da pasta `dist`. Os executáveis Windows do
COLMAP e OpenMVS não rodam nas funções da Vercel. Para disponibilizar a
fotogrametria real pela internet, hospede a pasta `server/` e os motores em uma
máquina própria ou serviço com processamento persistente e configure no projeto
da Vercel a variável `VITE_RECONSTRUCTION_API` com a URL HTTPS terminada em
`/api`. Sem essa variável, o deploy abre a interface e a demonstração, mas não
aceita reconstrução real de fotos.

As melhorias planejadas para a próxima rodada estão em
[`PROXIMAS_MELHORIAS.md`](PROXIMAS_MELHORIAS.md).
