import * as vscode from 'vscode';
import { IHostConfiguration, HostHelper } from './configuration';
import * as https from 'https';
import * as http from 'http';
import * as url from 'url';
import * as qs from 'querystring';
import Logger from '../common/logger';

const HTTP_PROTOCOL: string = 'https';

class Client {
	//private _guid?: string;
	private _token: string | undefined;
	private _srv: http.Server;
	constructor(private host: string) { }

	// TODO:  start localhost listener
	public start(): Promise<string> {
		let access:string
		let refresh:string

		return new Promise((resolve, reject) => {
			try {
				Logger.appendLine('creating BB server callback listener');
				this._srv = http.createServer((request,response) => {
					Logger.appendLine('Got OAuth callback from BB: ' + request.url);
					let params = url.parse(request.url,true).query;
								if (params.error) {
									reject(params.error);
									return;
								}
								// TODO add in state: https://github.com/kristianmandrup/bitbucket-auth/blob/master/client/generic/server/sample.js#L72

								response.writeHead(200, {'Content-Type': 'text/html'});
								response.write('<!DOCTYPE "html">');
								response.write('<html>');
								response.write('<head>');
								response.write('<title>Hello World Page</title>');
								response.write('</head>');
								response.write('<body>');
								response.write('Hello World!');
								response.write('</body>');
								response.write('</html>');
								response.end();

								let bbcode:string = params.code.toString();
								Logger.appendLine('code is: ' + bbcode);

								let postData = qs.stringify({
									'grant_type' : 'authorization_code',
									'code' : bbcode
								});

								// make basic auth request to get access token
								let tokenOptions = {
									host: 'bitbucket.org',
									port: 443,
									path: '/site/oauth2/access_token',
									method: 'POST',
									auth: 'DQhnLnWwACPXJXW2qX:uwACseDkGP4hc7JvWHAatZZruHzYpLMH',
									headers: {
										'Content-Type': 'application/x-www-form-urlencoded',
										'Content-Length': Buffer.byteLength(postData)
									  }
								};
								let gettoken = https.request(tokenOptions, res => {
									res.on('data', (d) => {
										Logger.appendLine('got BB token data');
										Logger.appendLine(d.toString());
										Logger.appendLine('end BB token data');

										let tokenData = JSON.parse(d.toString())
										access = tokenData.access_token
										refresh = tokenData.refresh_token

										Logger.appendLine('access_token: ' + access);
										Logger.appendLine('refresh_token: ' + refresh);
									});
								});

								gettoken.write(postData);
								gettoken.end();

								resolve(access)
								this.finish(resolve, access);
				});
				this._srv.listen(9090);
				vscode.commands.executeCommand('vscode.open', vscode.Uri.parse(`${HTTP_PROTOCOL}://${this.host}/site/oauth2/authorize?client_id=DQhnLnWwACPXJXW2qX&response_type=code`));
			} catch (reason) {
				reject(reason);
				return;
			}

		});
	}

	private finish(resolve: (value?: string | PromiseLike<string>) => void, token?: string): void {
		this._token = token;
		try {
			this._srv.close();
		} catch { } // at this point we don't care if we can't close the socket
		resolve(this._token);
	}
}

export class BitbucketManager {
	private servers: Map<string, boolean>;

	constructor() {
		this.servers = new Map().set('bitbucket.org', true);
	}

	public async isBitbucket(host: vscode.Uri): Promise<boolean> {
		if (host === null) {
			return false;
		}

		if (this.servers.has(host.authority)) {
			return this.servers.get(host.authority);
		}

		return false;
	}

	public static getOptions(hostUri: vscode.Uri, method: string = 'GET', path: string, token?: string) {
		const headers: {
			'user-agent': string;
			authorization?: string;
		} = {
			'user-agent': 'GitHub VSCode Pull Requests',
		};
		if (token) {
			headers.authorization = `Bearer ${token}`;
		}
		return {
			host: HostHelper.getApiHost(hostUri).authority,
			port: 443,
			method,
			path: HostHelper.getApiPath(hostUri, path),
			headers,
		};
	}
}

export class BitbucketServer {
	public hostConfiguration: IHostConfiguration;
	private hostUri: vscode.Uri;

	public constructor(host: string) {
		host = host.toLocaleLowerCase();
		this.hostConfiguration = { host, username: 'oauth', token: undefined };
		this.hostUri = vscode.Uri.parse(host);
	}

	public async login(): Promise<IHostConfiguration> {
		//return new Client(this.hostConfiguration.host)
		return new Client('bitbucket.org')
			.start()
			.then(token => {
				this.hostConfiguration.token = token;
				return this.hostConfiguration;
			});
	}

	public async validate(username?: string, token?: string): Promise<IHostConfiguration> {
		if (!username) {
			username = this.hostConfiguration.username;
		}
		if (!token) {
			token = this.hostConfiguration.token;
		}

		const options = BitbucketManager.getOptions(this.hostUri, 'GET', '/user', token);

		return new Promise<IHostConfiguration>((resolve, _) => {
			const get = https.request(options, res => {
				let hostConfig: IHostConfiguration | undefined;
				try {
					if (res.statusCode === 200) {
						this.hostConfiguration.username = username;
						this.hostConfiguration.token = token;
						hostConfig = this.hostConfiguration;
					}
				} catch (e) {
					Logger.appendLine(`validate() error ${e}`);
				}
				resolve(hostConfig);
			});

			get.end();
			get.on('error', err => {
				resolve(undefined);
			});
		});
	}
}
