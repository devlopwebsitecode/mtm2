const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3050;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

app.use(express.static(path.join(__dirname)));

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 MTM2 Handball & Kinematics Studio is running at: http://localhost:' + PORT);
  console.log('📱 On mobile (same Wi-Fi): http://<Your-PC-IP>:' + PORT);
});
