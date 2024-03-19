import type { UmbDocumentVariantPickerData, UmbDocumentVariantPickerValue } from '../types.js';
import { UMB_DOCUMENT_PUBLISH_WITH_DESCENDANTS_MODAL_ALIAS } from '../manifests.js';
import { UmbModalToken } from '@umbraco-cms/backoffice/modal';

export interface UmbDocumentPublishWithDescendantsModalData extends UmbDocumentVariantPickerData {}

export interface UmbDocumentPublishWithDescendantsModalValue extends UmbDocumentVariantPickerValue {
	includeUnpublishedDescendants?: boolean;
}

export const UMB_DOCUMENT_PUBLISH_WITH_DESCENDANTS_MODAL = new UmbModalToken<
	UmbDocumentPublishWithDescendantsModalData,
	UmbDocumentPublishWithDescendantsModalValue
>(UMB_DOCUMENT_PUBLISH_WITH_DESCENDANTS_MODAL_ALIAS, {
	modal: {
		type: 'dialog',
	},
});
