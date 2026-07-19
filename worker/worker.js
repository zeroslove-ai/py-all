import { AwsClient } from 'aws4fetch';

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return Response.json({ ok: false, stage: 'method', status: 405 }, { status: 405 });
    }

    try {
      const { text, voice_id, key } = await request.json();
      const fish = await fetch('https://api.fish.audio/v1/tts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.FISH_API_KEY}`,
          'Content-Type': 'application/json',
          'model': 's2.1-pro-free'
        },
        body: JSON.stringify({ text, reference_id: voice_id, format: 'mp3' })
      });

      if (!fish.ok) {
        const body = await fish.text();
        return Response.json({ ok: false, stage: 'fish', status: fish.status, body: body.slice(0, 500) });
      }

      const mp3 = await fish.arrayBuffer();
      const objectKey = key || `${crypto.randomUUID()}.mp3`;
      await env.tts.put(objectKey, mp3, { httpMetadata: { contentType: 'audio/mpeg' } });

      const r2 = new AwsClient({
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        service: 's3',
        region: 'auto'
      });
      const signUrl = new URL(`https://98efff3e9faacb9e57a14177682143a8.r2.cloudflarestorage.com/tts/${objectKey}`);
      signUrl.searchParams.set('X-Amz-Expires', '3600');
      const signed = await r2.sign(signUrl, { method: 'GET', aws: { signQuery: true } });

      return Response.json({ ok: true, url: signed.url, key: objectKey });
    } catch (e) {
      return Response.json({ ok: false, stage: 'exception', message: String(e && e.message || e).slice(0, 300) }, { status: 500 });
    }
  }
};
