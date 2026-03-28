const https = require('https');
const fs = require('fs');
https.get('https://stdatd.vercel.app/', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const match = data.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (!match) return console.log('no match');
    https.get('https://stdatd.vercel.app' + match[1], (jsRes) => {
      let js = '';
      jsRes.on('data', c => js += c);
      jsRes.on('end', () => {
        console.log('API_URL value:', js.includes('https://attend-api-xfcb.onrender.com') ? 'CORRECT_RENDER' : js.includes('http://localhost:5000') ? 'LOCALHOST_ERROR' : 'UNKNOWN');
      });
    });
  });
});
