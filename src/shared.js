export const DEFAULT_ENDPOINT = 'https://alttextgeneratorai.com/api/directus';
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
export const DASHBOARD_URL = 'https://alttextgeneratorai.com/dashboard';
const STORE = 'altTextGenerator';

export function load(key, fallback = '') {
	try {
		return localStorage.getItem(`${STORE}.${key}`) || fallback;
	} catch {
		return fallback;
	}
}

export function store(key, value) {
	try {
		localStorage.setItem(`${STORE}.${key}`, value);
	} catch {
		/* private mode */
	}
}

export function endpoint() {
	return load('endpoint', DEFAULT_ENDPOINT);
}

function blobToDataUrl(blob) {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});
}

function shortMessage(text) {
	const t = (text || '').trim();
	return t && t.length < 160 && !t.startsWith('<') ? t : '';
}

/**
 * Sends one file from the Directus library to the Alt Text Generator service.
 * Resolves { ok: true, text, creditsLeft } or { ok: false, error }.
 */
export async function generateForFile(api, fileId) {
	const apiKey = load('apiKey');
	if (!apiKey) return { ok: false, error: 'Add your API key in the Alt Text Generator module first.' };

	try {
		const res = await api.get(`/assets/${fileId}`, {
			params: { width: 1024, height: 1024, fit: 'inside', format: 'jpg', quality: 80, withoutEnlargement: true },
			responseType: 'blob',
		});
		const image = await blobToDataUrl(res.data);
		const out = await fetch(endpoint(), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ image, wpkey: apiKey, language: load('language', 'english') }),
		});
		const text = await out.text();
		if (!out.ok) {
			return {
				ok: false,
				error: out.status === 401 ? 'Invalid API key.' : out.status === 402 ? 'No credits left on this API key.' : shortMessage(text) || `Generation failed (${out.status}).`,
			};
		}
		const header = out.headers.get('X-Credits-Left');
		return { ok: true, text: text.trim(), creditsLeft: header === null || Number.isNaN(Number(header)) ? null : Number(header) };
	} catch {
		return { ok: false, error: 'Could not generate alt text. Check your connection.' };
	}
}
