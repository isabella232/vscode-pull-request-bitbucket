/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as Bitbukit from 'bitbucket';
import * as vscode from 'vscode';
import { IHostConfiguration, HostHelper } from '../authentication/configuration';
import { BitbucketServer } from '../authentication/bitbucketServer';
import { Remote } from '../common/remote';
import { VSCodeConfiguration } from '../authentication/vsConfiguration';
import Logger from '../common/logger';
import { ITelemetry } from './interface';

const TRY_AGAIN = 'Try again?';
const SIGNIN_COMMAND = 'Sign in';

/*
const fs = require('fs');
const HttpsProxyAgent = require('https-proxy-agent');
const BitBucket = require('bitbucket')

const bitbucket = new BitBucket({options:{ agent:new HttpsProxyAgent('http://127.0.0.1:8888'), ca: [fs.readFileSync('charles-ssl-proxying-certificate.pem')]}})

bitbucket.authenticate({
    type: 'oauth',
    key: 'DQhnLnWwACPXJXW2qX',
    secret: 'uwACseDkGP4hc7JvWHAatZZruHzYpLMH'
  })

  bitbucket.repositories
  .list({ username: 'brainicorn' })
  .then(({ data, headers }) => console.log(data.values))
  .catch(err => console.error(err))

  */

export class CredentialStore {
	private _bitbukits: Map<string, Bitbukit>;
	private _configuration: VSCodeConfiguration;
	private _authenticationStatusBarItems: Map<string, vscode.StatusBarItem>;

	constructor(configuration: any,
		private readonly _telemetry: ITelemetry) {
		this._configuration = configuration;
		this._bitbukits = new Map<string, Bitbukit>();
		this._authenticationStatusBarItems = new Map<string, vscode.StatusBarItem>();
	}

	public reset() {
		this._bitbukits = new Map<string, Bitbukit>();

		this._authenticationStatusBarItems.forEach(statusBarItem => statusBarItem.dispose());
		this._authenticationStatusBarItems = new Map<string, vscode.StatusBarItem>();
	}

	public async hasBitbukit(remote: Remote): Promise<boolean> {
		// the remote url might be http[s]/git/ssh but we always go through https for the api
		// so use a normalized http[s] url regardless of the original protocol
		const normalizedUri = remote.gitProtocol.normalizeUri();
		const host = `${normalizedUri.scheme}://${normalizedUri.authority}`;

		if (this._bitbukits.has(host)) {
			return true;
		}

		this._configuration.setHost(host);

		const creds: IHostConfiguration = this._configuration;
		const server = new BitbucketServer(host);
		let bitbukit: Bitbukit;

		if (creds.token) {
			if (await server.validate(creds.username, creds.token)) {
				bitbukit = this.createBitbukit('token', creds);
			} else {
				this._configuration.removeHost(creds.host);
			}
		}

		if (bitbukit) {
			this._bitbukits.set(host, bitbukit);
		}
		this.updateAuthenticationStatusBar(remote);
		return this._bitbukits.has(host);
	}

	public getBitbukit(remote: Remote): Bitbukit {
		const normalizedUri = remote.gitProtocol.normalizeUri();
		const host = `${normalizedUri.scheme}://${normalizedUri.authority}`;
		return this._bitbukits.get(host);
	}

	public async loginWithConfirmation(remote: Remote): Promise<Bitbukit> {
		const normalizedUri = remote.gitProtocol.normalizeUri();
		const result = await vscode.window.showInformationMessage(
			`In order to use the Pull Requests functionality, you need to sign in to ${normalizedUri.authority}`,
			SIGNIN_COMMAND);

		if (result === SIGNIN_COMMAND) {
			return await this.login(remote);
		} else {
			// user cancelled sign in, remember that and don't ask again
			this._bitbukits.set(`${normalizedUri.scheme}://${normalizedUri.authority}`, undefined);
			this._telemetry.on('auth.cancel');
		}
	}

	public async login(remote: Remote): Promise<Bitbukit> {
		this._telemetry.on('auth.start');

		// the remote url might be http[s]/git/ssh but we always go through https for the api
		// so use a normalized http[s] url regardless of the original protocol
		const normalizedUri = remote.gitProtocol.normalizeUri();
		const host = `${normalizedUri.scheme}://${normalizedUri.authority}`;

		let retry: boolean = true;
		let bitbukit: Bitbukit;
		const server = new BitbucketServer(host);

		while (retry) {
			try {
				const login = await server.login();
				if (login) {
					bitbukit = this.createBitbukit('token', login);
					await this._configuration.update(login.username, login.token, login.refresh);
					vscode.window.showInformationMessage(`You are now signed in to ${normalizedUri.authority}`);
				}
			} catch (e) {
				Logger.appendLine(`Error signing in to ${normalizedUri.authority}: ${e}`);
				if (e instanceof Error) {
					Logger.appendLine(e.stack);
				}
			}

			if (bitbukit) {
				retry = false;
			} else if (retry) {
				retry = (await vscode.window.showErrorMessage(`Error signing in to ${normalizedUri.authority}`, TRY_AGAIN)) === TRY_AGAIN;
			}
		}

		if (bitbukit) {
			this._bitbukits.set(host, bitbukit);
			this._telemetry.on('auth.success');
		} else {
			this._telemetry.on('auth.fail');
		}

		this.updateAuthenticationStatusBar(remote);

		return bitbukit;
	}

	private createBitbukit(type: string, creds: IHostConfiguration): Bitbukit {
		const bitbukit = new Bitbukit();

		if (creds.token) {
			if (type === 'token') {
				bitbukit.authenticate({
					type: 'token',
					token: creds.token,
				});
			} else {
				bitbukit.authenticate({
					type: 'basic',
					username: creds.username,
					password: creds.token,
				});
			}
		}
		return bitbukit;
	}

	private async updateStatusBarItem(statusBarItem: vscode.StatusBarItem, remote: Remote): Promise<void> {
		const bitbukit = this.getBitbukit(remote);
		let text: string;
		let command: string;

		if (bitbukit) {
			try {
				let { data, headers } = await bitbukit.user.get({  });
				text = `$(mark-github) ${data.display_name}`;
			} catch (e) {
				text = '$(mark-github) Signed in';
			}

			command = null;
		} else {
			const authority = remote.gitProtocol.normalizeUri().authority;
			text = `$(mark-github) Sign in to ${authority}`;
			command = 'pr.signin';
		}

		statusBarItem.text = text;
		statusBarItem.command = command;
	}

	private async updateAuthenticationStatusBar(remote: Remote): Promise<void> {
		const authority = remote.gitProtocol.normalizeUri().authority;
		const statusBarItem = this._authenticationStatusBarItems.get(authority);
		if (statusBarItem) {
			await this.updateStatusBarItem(statusBarItem, remote);
		} else {
			const newStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
			this._authenticationStatusBarItems.set(authority, newStatusBarItem);

			await this.updateStatusBarItem(newStatusBarItem, remote);
			newStatusBarItem.show();
		}
	}

}
