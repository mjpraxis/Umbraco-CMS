import { DocumentService } from '@umbraco-cms/backoffice/external/backend-api';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { tryExecuteAndNotify } from '@umbraco-cms/backoffice/resources';
import type { UmbDuplicateDataSource, UmbDuplicateToRequestArgs } from '@umbraco-cms/backoffice/entity-action';

/**
 * Duplicate Document Server Data Source
 * @export
 * @class UmbDuplicateDocumentServerDataSource
 */
export class UmbDuplicateDocumentServerDataSource implements UmbDuplicateDataSource {
	#host: UmbControllerHost;

	/**
	 * Creates an instance of UmbDuplicateDocumentServerDataSource.
	 * @param {UmbControllerHost} host
	 * @memberof UmbDuplicateDocumentServerDataSource
	 */
	constructor(host: UmbControllerHost) {
		this.#host = host;
	}

	/**
	 * Duplicate an item for the given id to the destination unique
	 * @param {UmbDuplicateToRequestArgs} args
	 * @return {*}
	 * @memberof UmbDuplicateDocumentServerDataSource
	 */
	async duplicateTo(args: UmbDuplicateToRequestArgs) {
		if (!args.unique) throw new Error('Unique is missing');
		if (args.destination.unique === undefined) throw new Error('Destination unique is missing');

		return tryExecuteAndNotify(
			this.#host,
			DocumentService.postDocumentByIdCopy({
				id: args.unique,
				requestBody: {
					target: args.destination.unique ? { id: args.destination.unique } : null,
					relateToOriginal: args.relateToOriginal,
					includeDescendants: args.includeDescendants,
				},
			}),
		);
	}
}
