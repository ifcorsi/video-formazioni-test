const express = require('express');
const app = express();
app.use(express.json());

app.get('/', (req, res) => res.send('🚀 Video Generator OK!'));

app.post('/generate-video', async (req, res) => {
  res.json({ status: 'Video generato!', url: 'pres1.mp4' });
});

app.listen(3000, () => console.log('Server su porta 3000'));
