<template>
	<div class="alt-text-button">
		<v-button small secondary :loading="loading" :disabled="disabled || !canGenerate" @click="generate">Generate alt text</v-button>
		<small v-if="error" class="error">{{ error }}</small>
		<small v-else-if="done">Added to {{ target }}. Save the file to keep it.</small>
		<small v-else-if="!hasKey">
			Add your API key in the Alt Text Generator module, or
			<a href="https://alttextgeneratorai.com/dashboard" target="_blank" rel="noopener">get a free API key</a>.
		</small>
	</div>
</template>

<script setup>
import { computed, ref } from 'vue';
import { useApi } from '@directus/extensions-sdk';
import { generateForFile, load } from '../shared.js';

const props = defineProps({
	primaryKey: { type: [String, Number], default: null },
	targetField: { type: String, default: 'description' },
	disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['setFieldValue']);
const api = useApi();

const loading = ref(false);
const error = ref('');
const done = ref(false);
const target = computed(() => props.targetField || 'description');
const hasKey = computed(() => Boolean(load('apiKey')));
const canGenerate = computed(() => hasKey.value && props.primaryKey && props.primaryKey !== '+');

async function generate() {
	loading.value = true;
	error.value = '';
	done.value = false;
	const result = await generateForFile(api, props.primaryKey);
	loading.value = false;
	if (!result.ok) {
		error.value = result.error;
		return;
	}
	emit('setFieldValue', { field: target.value, value: result.text });
	done.value = true;
}
</script>

<style scoped>
.alt-text-button {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
}
small {
	color: var(--theme--foreground-subdued);
}
.error {
	color: var(--theme--danger);
}
</style>
