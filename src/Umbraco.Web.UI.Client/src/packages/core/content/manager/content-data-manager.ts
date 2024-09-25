import { UmbControllerBase } from '@umbraco-cms/backoffice/class-api';
import type { UmbContentDetailModel, UmbPotentialContentValueModel } from '@umbraco-cms/backoffice/content';
import type { UmbControllerHost } from '@umbraco-cms/backoffice/controller-api';
import { createExtensionApi } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';
import { UmbObjectState, appendToFrozenArray, jsonStringComparison } from '@umbraco-cms/backoffice/observable-api';
import { UmbVariantId, type UmbEntityVariantModel } from '@umbraco-cms/backoffice/variant';
import type { UmbWorkspaceDataManager } from '@umbraco-cms/backoffice/workspace';

export class UmbContentWorkspaceDataManager<
		ModelType extends UmbContentDetailModel,
		ModelVariantType extends UmbEntityVariantModel = ModelType extends { variants: UmbEntityVariantModel[] }
			? ModelType['variants'][0]
			: never,
	>
	extends UmbControllerBase
	implements UmbWorkspaceDataManager<ModelType>
{
	//
	//#repository;
	#variantScaffold?: ModelVariantType;

	#persisted = new UmbObjectState<ModelType | undefined>(undefined);
	readonly current = new UmbObjectState<ModelType | undefined>(undefined);

	#varies?: boolean;
	//#variesByCulture?: boolean;
	//#variesBySegment?: boolean;

	constructor(host: UmbControllerHost, variantScaffold: ModelVariantType) {
		super(host);
		this.#variantScaffold = variantScaffold;
	}

	setData(incomingData: ModelType | undefined) {
		this.#persisted.setValue(incomingData);
		this.current.setValue(incomingData);
	}

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	setVariesByCulture(vary: boolean | undefined) {
		//this.#variesByCulture = vary;
	}
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	setVariesBySegment(vary: boolean | undefined) {
		//this.#variesBySegment = vary;
	}
	setVaries(vary: boolean | undefined) {
		this.#varies = vary;
	}

	setPersistedData(data: ModelType | undefined) {
		this.#persisted.setValue(data);
	}
	setCurrentData(data: ModelType | undefined) {
		this.current.setValue(data);
	}

	getPersistedData() {
		return this.#persisted.getValue();
	}

	getCurrentData() {
		return this.current.getValue();
	}

	ensureVariantData(variantId: UmbVariantId) {
		this.updateVariantData(variantId);
	}

	updateVariantData(variantId: UmbVariantId, update?: Partial<ModelVariantType>) {
		const currentData = this.current.getValue();
		if (!currentData) throw new Error('Data is missing');
		if (!this.#variantScaffold) throw new Error('Variant scaffold data is missing');
		if (this.#varies === true) {
			// If variant Id is invariant, we don't to have the variant appended to our data.
			if (variantId.isInvariant()) return;
			const variant = currentData.variants.find((x) => variantId.compare(x));
			const newVariants = appendToFrozenArray(
				currentData.variants,
				{
					...this.#variantScaffold,
					...variantId.toObject(),
					...variant,
					...update,
				} as ModelVariantType,
				(x) => variantId.compare(x),
			) as Array<ModelVariantType>;
			// TODO: I have some trouble with TypeScript here, I does not look like me, but i had to give up. [NL]
			this.current.update({ variants: newVariants } as any);
		} else if (this.#varies === false) {
			// TODO: Beware about segments, in this case we need to also consider segments, if its allowed to vary by segments.
			const invariantVariantId = UmbVariantId.CreateInvariant();
			const variant = currentData.variants.find((x) => invariantVariantId.compare(x));
			// Cause we are invariant, we will just overwrite all variants with this one:
			const newVariants = [
				{
					...this.#variantScaffold,
					...invariantVariantId.toObject(),
					...variant,
					...update,
				} as ModelVariantType,
			];
			// TODO: I have some trouble with TypeScript here, I does not look like me, but i had to give up. [NL]
			this.current.update({ variants: newVariants } as any);
		} else {
			throw new Error('Varies by culture is missing');
		}
	}

	async constructData(selectedVariants: Array<UmbVariantId>): Promise<ModelType> {
		// Lets correct the selected variants, so invariant is included, or the only one if invariant.
		// TODO: VDIVD: Could a document be set to invariant but hold variant data inside it?
		const invariantVariantId = UmbVariantId.CreateInvariant();
		let variantsToStore = [invariantVariantId];
		if (this.#varies === false) {
			// If we do not vary, we wil just pick the invariant variant id.
			selectedVariants = [invariantVariantId];
		} else {
			variantsToStore = [...selectedVariants, invariantVariantId];
		}

		const data = this.current.getValue();
		if (!data) throw new Error('Data is missing');
		if (!data.unique) throw new Error('Unique is missing');

		const persistedData = this.getPersistedData();

		// Combine data and persisted data depending on the selectedVariants. Always use the invariant values from the data.
		// loops over each entry in values, determine wether the value should be from the data or the persisted data, depending on wether its a selectedVariant or an invariant value.
		// loops over each entry in variants, determine wether the variant should be from the data or the persisted data, depending on the selectedVariants.
		const result = {
			...data,
			values: await this.#buildSaveValues<UmbPotentialContentValueModel>(
				persistedData?.values,
				data.values,
				selectedVariants,
				variantsToStore,
			),
			variants: this.#buildSaveVariants(persistedData?.variants, data.variants, selectedVariants),
		};

		return result;
	}

	async #buildSaveValues<T extends UmbPotentialContentValueModel = UmbPotentialContentValueModel>(
		persistedValues: Array<T> | undefined,
		draftValues: Array<T> | undefined,
		selectedVariants: Array<UmbVariantId>,
		variantsToStore: Array<UmbVariantId>,
	): Promise<Array<T>> {
		// Make array of unique values, based on persistedValues and draftValues. Both alias, culture and segment has to be taken into account. [NL]

		const uniqueValues = [...(persistedValues ?? []), ...(draftValues ?? [])].filter(
			(n, i, self) =>
				i === self.findIndex((v) => v.alias === n.alias && v.culture === n.culture && v.segment === n.segment),
		);

		// Map unique values to their respective draft values.
		return (
			await Promise.all(
				uniqueValues.map((value) => {
					const persistedValue = persistedValues?.find(
						(x) => x.alias === value.alias && x.culture === value.culture && x.segment === value.segment,
					);

					// Should this value be saved?
					if (variantsToStore.some((x) => x.equal(UmbVariantId.CreateFromPartial(value)))) {
						const draftValue = draftValues?.find(
							(x) => x.alias === value.alias && x.culture === value.culture && x.segment === value.segment,
						);

						return this.#buildSaveValue(persistedValue, draftValue, selectedVariants, variantsToStore);
					} else {
						// TODO: Check if this promise is needed: [NL]
						return Promise.resolve(persistedValue);
					}
				}),
			)
		).filter((x) => x !== undefined) as Array<T>;
	}

	async #buildSaveValue(
		persistedValue: UmbPotentialContentValueModel | undefined,
		draftValue: UmbPotentialContentValueModel | undefined,
		selectedVariants: Array<UmbVariantId>,
		variantsToStore: Array<UmbVariantId>,
	): Promise<UmbPotentialContentValueModel | undefined> {
		const editorAlias = draftValue?.editorAlias ?? persistedValue?.editorAlias;
		if (!editorAlias) {
			console.error(`Editor alias not found for ${editorAlias}`);
			return draftValue;
		}
		if (!draftValue) {
			// If the draft value does not exists then no need to process.
			return undefined;
		}

		// Find the resolver for this editor alias:
		const manifest = umbExtensionsRegistry.getByTypeAndFilter(
			'propertyValueResolver',
			(x) => x.meta.editorAlias === editorAlias,
		)[0];

		if (!manifest) {
			// No resolver found, then we can continue using the draftValue as is.
			return draftValue;
		}

		const api = await createExtensionApi(this, manifest);
		if (!api) {
			// If api is not to be found, then we can continue using the draftValue as is.
			return draftValue;
		}

		let newValue = draftValue;

		if (api.processValues) {
			// The a property values resolver resolves one value, we need to gather the persisted inner values first, and store them here:
			const persistedValuesHolder: Array<Array<UmbPotentialContentValueModel>> = [];

			if (persistedValue) {
				await api.processValues(persistedValue, async (values) => {
					persistedValuesHolder.push(values as unknown as Array<UmbPotentialContentValueModel>);
					return undefined;
				});
			}

			let valuesIndex = 0;
			newValue = await api.processValues(newValue, async (values) => {
				// got some values (content and/or settings):
				// but how to get the persisted and the draft of this.....
				const persistedValues = persistedValuesHolder[valuesIndex++];

				return await this.#buildSaveValues(persistedValues, values, selectedVariants, variantsToStore);
			});
		}

		if (api.ensureVariants) {
			// The a property values resolver resolves one value, we need to gather the persisted inner values first, and store them here:
			//const persistedVariants = newValue ? ((await api.readVariants(newValue)) ?? []) : [];

			const args = {
				selectedVariants,
			};
			newValue = await api.ensureVariants(newValue, args);
		}

		// the api did not provide a value processor, so we will return the draftValue:
		return newValue;
	}

	#buildSaveVariants(
		persistedVariants: Array<UmbEntityVariantModel> | undefined,
		draftVariants: Array<UmbEntityVariantModel>,
		selectedVariants: Array<UmbVariantId>,
	) {
		return draftVariants
			.map((variant) => {
				// Should this value be saved?
				if (selectedVariants.some((x) => x.compare(variant))) {
					return variant;
				} else {
					// If not we will find the value in the persisted data and use that instead.
					return persistedVariants?.find((x) => x.culture === variant.culture && x.segment === variant.segment);
				}
			})
			.filter((x) => x !== undefined) as Array<UmbEntityVariantModel>;
	}

	getChangedVariants() {
		const persisted = this.#persisted.getValue();
		const current = this.current.getValue();
		if (!current) throw new Error('Current data is missing');

		const changedVariants = current?.variants.map((variant) => {
			const persistedVariant = persisted?.variants.find((x) => UmbVariantId.Create(variant).compare(x));
			return {
				culture: variant.culture,
				segment: variant.segment,
				equal: persistedVariant ? jsonStringComparison(variant, persistedVariant) : false,
			};
		});

		const changedProperties = current?.values.map((value) => {
			const persistedValues = persisted?.values.find((x) => UmbVariantId.Create(value).compare(x));
			return {
				culture: value.culture,
				segment: value.segment,
				equal: persistedValues ? jsonStringComparison(value, persistedValues) : false,
			};
		});

		// calculate the variantIds of those who either have a change in properties or in variants:
		return (
			changedVariants
				?.concat(changedProperties ?? [])
				.filter((x) => x.equal === false)
				.map((x) => new UmbVariantId(x.culture, x.segment)) ?? []
		);
	}

	public override destroy(): void {
		this.#persisted.destroy();
		this.current.destroy();
		super.destroy();
	}
}
