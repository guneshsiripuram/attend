const https = require('https');

https.get('https://stdatd.vercel.app/', (res) => {
  let data = '';
  res.on('data', c => data += c);
  res.on('end', () => {
    const match = data.match(/src="(\/assets\/index-[^"]+\.js)"/);
    if (match) {
      console.log('Found main JS chunk:', match[1]);
      https.get('https://stdatd.vercel.app' + match[1], (jsRes) => {
        let jsData = '';
        jsRes.on('data', c => jsData += c);
        jsRes.on('end', () => {
          console.log('--- JS ANALYSIS ---');
          console.log('Contains localhost:', jsData.includes('http://localhost:5000'));
          console.log('Contains attend-api-xfcb:', jsData.includes('attend-api-xfcb'));
          console.log('Contains VITE_API_URL references:', jsData.includes('VITE_API_URL'));
        });
      });
    } else {
      console.log('No JS chunk found in index.html');
      console.log(data.substring(0, 500));
    }
  });
}).on('error', console.error);
