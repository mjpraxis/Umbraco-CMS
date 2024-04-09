import { onInit } from '../../packages/core/entry-point.js';
import type { UmbAppErrorElement } from './app-error.element.js';
import { UmbAppContext } from './app.context.js';
import { UmbServerConnection } from './server-connection.js';
import { UmbAppAuthController } from './app-auth.controller.js';
import type { UMB_AUTH_CONTEXT } from '@umbraco-cms/backoffice/auth';
import { UmbAuthContext } from '@umbraco-cms/backoffice/auth';
import { css, html, customElement, property } from '@umbraco-cms/backoffice/external/lit';
import { UUIIconRegistryEssential } from '@umbraco-cms/backoffice/external/uui';
import { UmbIconRegistry } from '@umbraco-cms/backoffice/icon';
import { UmbLitElement } from '@umbraco-cms/backoffice/lit-element';
import type { Guard, UmbRoute } from '@umbraco-cms/backoffice/router';
import { pathWithoutBasePath } from '@umbraco-cms/backoffice/router';
import { OpenAPI, RuntimeLevelModel } from '@umbraco-cms/backoffice/external/backend-api';
import { UmbContextDebugController } from '@umbraco-cms/backoffice/debug';
import { UmbServerExtensionRegistrator } from '@umbraco-cms/backoffice/extension-api';
import { umbExtensionsRegistry } from '@umbraco-cms/backoffice/extension-registry';

@customElement('umb-app')
export class UmbAppElement extends UmbLitElement {
	/**
	 * The base URL of the configured Umbraco server.
	 *
	 * @attr
	 * @remarks This is the base URL of the Umbraco server, not the base URL of the backoffice.
	 */
	@property({ type: String })
	set serverUrl(url: string) {
		OpenAPI.BASE = url;
	}
	get serverUrl() {
		return OpenAPI.BASE;
	}

	/**
	 * The base path of the backoffice.
	 *
	 * @attr
	 */
	@property({ type: String })
	backofficePath = '/umbraco';

	/**
	 * Bypass authentication.
	 */
	@property({ type: Boolean })
	bypassAuth = false;

	private _routes: UmbRoute[] = [
		{
			path: 'install',
			component: () => import('../installer/installer.element.js'),
		},
		{
			path: 'upgrade',
			component: () => import('../upgrader/upgrader.element.js'),
			guards: [this.#isAuthorizedGuard()],
		},
		{
			path: '**',
			component: () => import('../backoffice/backoffice.element.js'),
			guards: [this.#isAuthorizedGuard()],
		},
	];

	#authContext?: typeof UMB_AUTH_CONTEXT.TYPE;
	#serverConnection?: UmbServerConnection;
	#authController = new UmbAppAuthController(this);

	constructor() {
		super();

		OpenAPI.BASE = window.location.origin;

		new UmbIconRegistry().attach(this);
		new UUIIconRegistryEssential().attach(this);

		new UmbContextDebugController(this);
	}

	connectedCallback(): void {
		super.connectedCallback();
		this.#setup();
	}

	async #setup() {
		this.#serverConnection = await new UmbServerConnection(this.serverUrl).connect();

		this.#authContext = new UmbAuthContext(this, this.serverUrl, this.backofficePath, this.bypassAuth);
		new UmbAppContext(this, { backofficePath: this.backofficePath, serverUrl: this.serverUrl });

		// Register Core extensions (this is specifically done here because we need these extensions to be registered before the application is initialized)
		onInit(this, umbExtensionsRegistry);

		// Register public extensions
		await new UmbServerExtensionRegistrator(this, umbExtensionsRegistry).registerPublicExtensions();

		// Try to initialise the auth flow and get the runtime status
		try {
			// If the runtime level is "install" we should clear any cached tokens
			// else we should try and set the auth status
			if (this.#serverConnection.getStatus() === RuntimeLevelModel.INSTALL) {
				await this.#authContext.clearTokenStorage();
			} else {
				await this.#setAuthStatus();
			}

			// Initialise the router
			this.#redirect();
		} catch (error) {
			// If the auth flow fails, there is most likely something wrong with the connection to the backend server
			// and we should redirect to the error page
			let errorMsg =
				'An error occurred while trying to initialize the connection to the Umbraco server (check console for details)';

			// Get the type of the error and check http status codes
			if (error instanceof Error) {
				// If the error is a "TypeError" it means that the server is not reachable
				if (error.name === 'TypeError') {
					errorMsg = 'The Umbraco server is unreachable (check console for details)';
				}
			}

			// Log the error
			console.error(errorMsg, error);

			// Redirect to the error page
			this.#errorPage(errorMsg, error);
		}
	}

	// TODO: move set initial auth state into auth context
	async #setAuthStatus() {
		if (this.bypassAuth) return;

		if (!this.#authContext) {
			throw new Error('[Fatal] AuthContext requested before it was initialized');
		}

		// Get service configuration from authentication server
		await this.#authContext?.setInitialState();

		// Instruct all requests to use the auth flow to get and use the access_token for all subsequent requests
		OpenAPI.TOKEN = () => this.#authContext!.getLatestToken();
		OpenAPI.WITH_CREDENTIALS = true;
	}

	#redirect() {
		// If there is a ?code parameter in the url, then we are in the middle of the oauth flow
		// and we need to complete the login (the authorization notifier will redirect after this is done
		// essentially hitting this method again)
		const queryParams = new URLSearchParams(window.location.search);
		if (queryParams.has('code')) {
			this.#authContext?.completeAuthorizationRequest();
			return;
		}

		switch (this.#serverConnection?.getStatus()) {
			case RuntimeLevelModel.INSTALL:
				history.replaceState(null, '', 'install');
				break;

			case RuntimeLevelModel.UPGRADE:
				history.replaceState(null, '', 'upgrade');
				break;

			case RuntimeLevelModel.BOOT_FAILED:
				this.#errorPage('The Umbraco server failed to boot');
				break;

			case RuntimeLevelModel.RUN: {
				const pathname = pathWithoutBasePath({ start: true, end: false });

				// If we are on installer or upgrade page, redirect to the root since we are in the RUN state
				if (pathname === '/install' || pathname === '/upgrade') {
					history.replaceState(null, '', '/');
					break;
				}

				// Keep the current path but replace state anyway to initialize the router
				// because the router will not initialize a wildcard route by itself
				history.replaceState(null, '', location.href);
				break;
			}

			default:
				// Redirect to the error page
				this.#errorPage(`Unsupported runtime level: ${this.#serverConnection?.getStatus()}`);
		}
	}

	#isAuthorizedGuard(): Guard {
		return () => this.#authController.isAuthorized() ?? false;
	}

	#errorPage(errorMsg: string, error?: unknown) {
		// Redirect to the error page
		this._routes = [
			{
				path: '**',
				component: () => import('./app-error.element.js'),
				setup: (component) => {
					(component as UmbAppErrorElement).errorMessage = errorMsg;
					(component as UmbAppErrorElement).error = error;
				},
			},
		];

		// Re-render the router
		this.requestUpdate();
	}

	render() {
		return html`<umb-router-slot id="router-slot" .routes=${this._routes}></umb-router-slot>`;
	}

	static styles = css`
		:host {
			overflow: hidden;
		}

		:host,
		#router-slot {
			display: block;
			width: 100%;
			height: 100vh;
		}
	`;
}

declare global {
	interface HTMLElementTagNameMap {
		'umb-app': UmbAppElement;
	}
}
