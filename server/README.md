# Motor de reconstrução do Órbita 3D

O serviço local usa COLMAP (posicionamento das câmeras) e OpenMVS sem CUDA
(profundidade, malha e textura). Não requer Docker, FFmpeg nem GPU NVIDIA.

No PowerShell, a partir da raiz do projeto:

```powershell
.\server\start.ps1
```

Mantenha essa janela aberta e, em outra janela, execute `npm run dev`.
A interface Vite encaminha `/api` para este serviço automaticamente.

