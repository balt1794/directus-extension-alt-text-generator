<template>
	<private-view title="Alt Text Generator">
		<template #title-outer:prepend>
			<img class="logo" :src="LOGO" alt="" />
		</template>

		<template #headline>Files</template>

		<template #actions>
			<v-button :disabled="!canGenerate || busy || targets.length === 0" @click="generateTargets">
				{{ selectedCount ? `Generate selected (${selectedCount})` : overwrite ? `Generate all (${files.length})` : `Generate all missing (${missingCount})` }}
			</v-button>
			<v-button :disabled="changedCount === 0 || busy" kind="success" @click="saveAll">Save changes ({{ changedCount }})</v-button>
		</template>

		<div class="page">
			<div class="card">
				<div class="field">
					<label>API key</label>
					<div class="keyrow">
						<v-input v-model="apiKey" type="password" placeholder="Paste your Alt Text Generator API key" @keyup.enter="saveKey" />
						<v-button small :disabled="!apiKey.trim() || apiKey.trim() === savedKey" :loading="checking" @click="saveKey">Save</v-button>
					</div>
					<small v-if="keyStatus === 'ok'">{{ creditsLeft }} credits remaining</small>
					<small v-else-if="keyStatus === 'invalid'" class="error">That API key was not found. Check it and save again.</small>
					<small v-else-if="keyStatus === 'offline'" class="error">Could not reach the Alt Text Generator service.</small>
					<small><a class="link" :href="DASHBOARD_URL" target="_blank" rel="noopener">Get a free API key</a></small>
				</div>

				<div class="row" :class="{ single: fieldItems.length <= 1 }">
					<div class="field">
						<label>Language</label>
						<v-select v-model="language" :items="languages" @update:model-value="persist" />
					</div>
					<div v-if="fieldItems.length > 1" class="field">
						<label>Save alt text in</label>
						<v-select v-model="targetField" :items="fieldItems" @update:model-value="onFieldChange" />
					</div>
				</div>
			</div>

			<div class="toolbar">
				<v-button small secondary :loading="scanning" @click="scan">Scan files</v-button>
				<v-button small :secondary="filter !== 'missing'" @click="filter = 'missing'">Missing</v-button>
				<v-button small :secondary="filter !== 'all'" @click="filter = 'all'">All</v-button>
				<v-checkbox v-model="overwrite" label="Overwrite images that already have alt text" />
				<span v-if="scanned" class="summary">{{ files.length }} images, {{ missingCount }} missing alt text</span>
			</div>

			<div v-if="shown.length" class="selectbar">
				<v-checkbox :model-value="allShownSelected" label="Select all shown" @update:model-value="toggleAll" />
				<span v-if="selectedCount" class="summary">{{ selectedCount }} selected</span>
			</div>

			<v-notice v-if="!hasAltField" type="info">
				Add a Generate alt text button to every file page. It fills the Description field.
				<v-button small :loading="creatingField" @click="createAltField">Add button to file pages</v-button>
			</v-notice>

			<v-notice v-if="message" :type="messageType">{{ message }}</v-notice>

			<v-notice v-if="scanned && shown.length === 0" type="info">
				{{ filter === 'missing' ? 'No images are missing alt text.' : 'No images found.' }}
			</v-notice>

			<div v-for="row in shown" :key="row.id" class="item">
				<v-checkbox v-model="row.selected" />
				<div class="thumb">
					<img v-if="row.thumb" :src="row.thumb" alt="" />
				</div>
				<div class="name">
					<strong>{{ row.title || row.filename }}</strong>
					<small>{{ row.filename }}</small>
				</div>
				<div class="text">
					<v-textarea v-model="row.text" :placeholder="row.current ? row.current : 'Alt text'" @update:model-value="row.changed = true" />
					<small v-if="row.error" class="error">{{ row.error }}</small>
					<small v-else-if="row.saved">Saved</small>
				</div>
				<div class="buttons">
					<v-button small secondary :loading="row.loading" :disabled="!canGenerate || busy" @click="generateOne(row)">Generate</v-button>
				</div>
			</div>

		</div>
	</private-view>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { LANGUAGES } from './languages.js';
import { LOGO } from '../logo.js';
import { DASHBOARD_URL, IMAGE_TYPES, endpoint as getEndpoint, generateForFile, load, store } from '../shared.js';

const api = useApi();

const savedKey = ref(load('apiKey', ''));
const apiKey = ref(savedKey.value);
const keyStatus = ref('');
const checking = ref(false);
const language = ref(load('language', 'english'));
const targetField = ref(load('field', 'description'));
const endpoint = getEndpoint();
const languages = LANGUAGES;
const fieldItems = ref([{ text: 'Description', value: 'description' }]);

const creditsLeft = ref(null);
const files = ref([]);
const filter = ref('missing');
const overwrite = ref(false);
const scanning = ref(false);
const scanned = ref(false);
const busy = ref(false);
const message = ref('');
const messageType = ref('info');

const creatingField = ref(false);
const hasAltField = ref(true);
const canGenerate = computed(() => Boolean(savedKey.value) && keyStatus.value !== 'invalid');
const missingCount = computed(() => files.value.filter((r) => !r.current).length);
const changedCount = computed(() => files.value.filter((r) => r.changed && r.text).length);
const shown = computed(() => files.value.filter((r) => filter.value === 'all' || !r.current || r.changed || r.text));

const selectedCount = computed(() => files.value.filter((r) => r.selected).length);
const targets = computed(() => (selectedCount.value ? files.value.filter((r) => r.selected) : overwrite.value ? files.value : files.value.filter((r) => !r.current)));
const allShownSelected = computed(() => shown.value.length > 0 && shown.value.every((r) => r.selected));

function toggleAll(value) {
	shown.value.forEach((r) => {
		r.selected = Boolean(value);
	});
}

function notify(text, type = 'info') {
	message.value = text;
	messageType.value = type;
}

function persist() {
	store('language', language.value);
}

function onFieldChange() {
	store('field', targetField.value);
	if (scanned.value) scan();
}

function verifyUrl() {
	return endpoint.replace(/\/[^/]+$/, '/verify');
}

async function checkCredits() {
	creditsLeft.value = null;
	keyStatus.value = '';
	const key = savedKey.value;
	if (!key) return;
	checking.value = true;
	try {
		const res = await fetch(verifyUrl(), {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ apiKey: key }),
		});
		if (res.status === 404 || res.status === 400) {
			keyStatus.value = 'invalid';
			return;
		}
		const data = await res.json();
		if (typeof data.freeRewritesLeft === 'number') {
			creditsLeft.value = data.freeRewritesLeft;
			keyStatus.value = 'ok';
		} else {
			keyStatus.value = 'invalid';
		}
	} catch {
		keyStatus.value = 'offline';
	} finally {
		checking.value = false;
	}
}

async function saveKey() {
	savedKey.value = apiKey.value.trim();
	apiKey.value = savedKey.value;
	store('apiKey', savedKey.value);
	await checkCredits();
}

async function loadFields() {
	try {
		const { data } = await api.get('/fields/directus_files');
		hasAltField.value = (data.data || []).some((f) => f.meta?.interface === 'alt-text-button');
		const items = (data.data || [])
			.filter((f) => ['string', 'text'].includes(f.type) && (f.field === 'description' || f.meta?.system !== true))
			.filter((f) => !['filename_disk', 'filename_download', 'type', 'charset', 'storage', 'checksum', 'tus_id', 'tus_data'].includes(f.field))
			.map((f) => ({ text: f.field === 'description' ? 'Description' : f.field, value: f.field }));
		if (items.length) fieldItems.value = items;
		if (!items.some((i) => i.value === targetField.value)) targetField.value = 'description';
	} catch {
		/* keep default */
	}
}

async function createAltField() {
	creatingField.value = true;
	try {
		await api.post('/fields/directus_files', {
			field: 'generate_alt_text',
			type: 'alias',
			meta: { interface: 'alt-text-button', special: ['alias', 'no-data'], width: 'full', sort: 4, options: { targetField: 'description' } },
		});
		hasAltField.value = true;
		notify('Added. Open any file to see the Generate alt text button under Description.', 'success');
	} catch {
		notify('Could not add the button. You need admin access to change the data model.', 'danger');
	} finally {
		creatingField.value = false;
	}
}

async function scan() {
	scanning.value = true;
	notify('');
	try {
		const field = targetField.value;
		const all = [];
		for (let page = 1; ; page++) {
			const { data } = await api.get('/files', {
				params: {
					limit: 200,
					page,
					sort: 'filename_download',
					fields: ['id', 'filename_download', 'title', 'type', field],
					filter: { type: { _in: IMAGE_TYPES } },
				},
			});
			const batch = data.data || [];
			all.push(...batch);
			if (batch.length < 200) break;
		}
		files.value = all.map((f) =>
			reactive({
				id: f.id,
				filename: f.filename_download,
				title: f.title,
				current: (f[field] || '').trim(),
				text: '',
				changed: false,
				selected: false,
				loading: false,
				saved: false,
				error: '',
				thumb: '',
			}),
		);
		scanned.value = true;
		loadThumbs(files.value);
	} catch (e) {
		notify('Could not load files. Check that you have access to the files collection.', 'danger');
	} finally {
		scanning.value = false;
	}
}

async function loadThumbs(rows) {
	const queue = [...rows];
	const worker = async () => {
		while (queue.length) {
			const row = queue.shift();
			try {
				const res = await api.get(`/assets/${row.id}`, { params: { width: 96, height: 96, fit: 'cover', format: 'jpg', quality: 70 }, responseType: 'blob' });
				row.thumb = URL.createObjectURL(res.data);
			} catch {
				/* no thumbnail */
			}
		}
	};
	await Promise.all([worker(), worker(), worker()]);
}

async function generateOne(row) {
	row.loading = true;
	row.error = '';
	row.saved = false;
	const result = await generateForFile(api, row.id);
	row.loading = false;
	if (!result.ok) {
		row.error = result.error;
		return false;
	}
	row.text = result.text;
	row.changed = true;
	if (result.creditsLeft !== null) creditsLeft.value = result.creditsLeft;
	return true;
}

async function generateTargets() {
	const list = targets.value.filter((r) => !r.loading);
	if (!list.length) return;
	busy.value = true;
	notify('');
	const queue = [...list];
	let stop = false;
	const worker = async () => {
		while (queue.length && !stop) {
			const row = queue.shift();
			const ok = await generateOne(row);
			if (!ok && /credits|API key/.test(row.error)) stop = true;
		}
	};
	await Promise.all([worker(), worker(), worker()]);
	busy.value = false;
	list.forEach((r) => {
		r.selected = false;
	});
	const failed = list.filter((r) => r.error).length;
	notify(failed ? `Done. ${failed} could not be generated.` : 'Done. Review the text, then save your changes.', failed ? 'warning' : 'success');
}

async function saveOne(row) {
	await api.patch(`/files/${row.id}`, { [targetField.value]: row.text });
	row.current = row.text;
	row.changed = false;
	row.saved = true;
}

async function saveAll() {
	busy.value = true;
	let saved = 0;
	for (const row of files.value.filter((r) => r.changed && r.text)) {
		try {
			await saveOne(row);
			saved++;
		} catch {
			row.error = 'Could not save this file.';
		}
	}
	busy.value = false;
	notify(`Saved ${saved} file${saved === 1 ? '' : 's'}.`, 'success');
}

onMounted(async () => {
	await loadFields();
	checkCredits();
	scan();
});
</script>

<style scoped>
.page {
	display: flex;
	flex-direction: column;
	gap: 20px;
	padding: 0 var(--content-padding) var(--content-padding-bottom);
}
.card {
	display: flex;
	flex-direction: column;
	gap: 16px;
	padding: 20px;
	border: var(--theme--border-width) solid var(--theme--border-color);
	border-radius: var(--theme--border-radius);
	background: var(--theme--background-subdued);
}
.row {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 16px;
}
.field {
	display: flex;
	flex-direction: column;
	gap: 6px;
}
label {
	font-weight: 600;
}
small {
	color: var(--theme--foreground-subdued);
}
.toolbar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 16px;
}
.filters {
	display: flex;
	gap: 8px;
}
.summary {
	color: var(--theme--foreground-subdued);
}
.item {
	display: grid;
	grid-template-columns: auto 56px 200px 1fr auto;
	gap: 16px;
	align-items: start;
	padding: 12px 0;
	border-bottom: var(--theme--border-width) solid var(--theme--border-color-subdued);
}
.thumb {
	width: 56px;
	height: 56px;
	border-radius: var(--theme--border-radius);
	background: var(--theme--background-normal);
	overflow: hidden;
}
.thumb img {
	width: 100%;
	height: 100%;
	object-fit: cover;
}
.name {
	display: flex;
	flex-direction: column;
	gap: 2px;
	overflow-wrap: anywhere;
}
.error {
	color: var(--theme--danger);
}
.keyrow {
	display: grid;
	grid-template-columns: 1fr auto;
	gap: 8px;
	align-items: center;
}
.selectbar {
	display: flex;
	align-items: center;
	gap: 16px;
}
.text :deep(textarea) {
	min-height: 52px;
	height: 52px;
	resize: vertical;
}
.text :deep(.v-textarea) {
	min-height: 0;
	height: auto;
}
code {
	font-family: var(--theme--fonts--monospace--font-family);
}
.logo {
	width: 44px;
	height: 44px;
	border-radius: 10px;
	margin-right: 12px;
}
.row.single {
	grid-template-columns: 1fr;
}
.link {
	color: var(--theme--foreground);
	text-decoration: underline;
}
</style>
