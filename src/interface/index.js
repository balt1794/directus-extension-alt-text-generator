import InterfaceComponent from './interface.vue';

export default {
	id: 'alt-text-button',
	name: 'Generate Alt Text',
	icon: 'image',
	description: 'A button that writes alt text for the image into another field.',
	component: InterfaceComponent,
	options: [
		{
			field: 'targetField',
			name: 'Field to fill',
			type: 'string',
			meta: { interface: 'input', width: 'full', note: 'The field that receives the alt text.' },
			schema: { default_value: 'description' },
		},
	],
	types: ['alias'],
	localTypes: ['presentation'],
	group: 'presentation',
};
