# 公共静态文件夹（public/）

放在本目录的文件会被**所有子站**以根路径直接访问，用于域名验证、favicon 等：

- 百度验证文件：`https://shaoguan.016.wiki/baidu_verify_xxx.html`
- Google 验证文件：`https://shaoguan.016.wiki/googlexxxxx.html`
- Bing/360/搜狗等验证文件同理

注意：同名文件会覆盖路由，请勿放置 `index.html`、`sitemap.xml`、`robots.txt` 等系统文件名。
