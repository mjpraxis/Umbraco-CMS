import { UmbControllerHostElement } from '@umbraco-cms/backoffice/controller-api';
import { UmbUserRepository } from '../../repository/user.repository';
import { UmbEntityBulkActionBase } from '@umbraco-cms/backoffice/entity-action';

export class UmbEnableUserEntityBulkAction extends UmbEntityBulkActionBase<UmbUserRepository> {
	constructor(host: UmbControllerHostElement, repositoryAlias: string, selection: Array<string>) {
		super(host, repositoryAlias, selection);
	}

	async execute() {
		await this.repository?.enable(this.selection);
	}
}
