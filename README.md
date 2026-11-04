# 太陽系模型

純前端、無需建置。用 Three.js 0.160（CDN）畫出八大行星、衛星、小行星帶與古柏帶，並可 WASD 自由飛行、降落地球查看真實地形。

| 檔案 | 內容 |
| --- | --- |
| `index.html` | 頁面結構（介面標記與資源載入） |
| `css/style.css` | 全部樣式 |
| `js/main.js` | 主程式（約 1,600 行；開頭註解有結構說明） |
| `js/textures.js` | 行星貼圖（base64，約 6.4 MB，很少需要改動） |

## 操作
拖曳旋轉・滾輪縮放・← → 切換天體・空白鍵暫停・H 收合介面・F 全螢幕
WASD 自由飛行（Q/E 下降/上升、Shift 加速、X 精細、Z 極細）・聚焦地球後可「降落地球」

## 地球地表圖層（無需 API key）
影像 Esri World Imagery、地形 AWS Terrain Tiles、國界與地名 Natural Earth。設定在 `js/main.js` 的 `GROUND`。
