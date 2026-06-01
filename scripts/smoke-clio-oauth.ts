import { buildAuthorizeUrl } from '@/lib/clio/oauth';

const url = buildAuthorizeUrl('test-state-' + Date.now().toString(36));
console.log('Authorize URL (paste in browser to test OAuth handshake):');
console.log(url);
