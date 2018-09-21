/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Bitbukit from 'bitbucket';
import Logger from '../common/logger';
import { Remote } from '../common/remote';
import { PRType, IGitHubRepository, IPullRequest } from './interface';
import { PullRequestModel } from './pullRequestModel';
import { CredentialStore } from './credentials';
import { AuthenticationError } from '../common/authentication';
import { parseRemote } from '../common/repository';

export const PULL_REQUEST_PAGE_SIZE = 20;

export interface PullRequestData {
	pullRequests: PullRequestModel[];
	hasMorePages: boolean;
}

export class GitHubRepository implements IGitHubRepository {
	private _bitbukit: Bitbukit;
	private _initialized: boolean;
	public get bitbukit(): Bitbukit {
		if (this._bitbukit === undefined) {
			if (!this._initialized) {
				throw new Error('Call ensure() before accessing this property.');
			} else {
				throw new AuthenticationError('Not authenticated.');
			}
		}
		return this._bitbukit;
	}

	constructor(public remote: Remote, private readonly _credentialStore: CredentialStore) {
	}

	async resolveRemote(): Promise<void> {
		try {
			const { bitbukit, remote } = await this.ensure();
			const { data } = await bitbukit.repositories.get({
				username: remote.owner,
				repo_slug: remote.repositoryName
			});

			this.remote = parseRemote(remote.remoteName, data.links.clone[0].href);
		} catch (e) {
			Logger.appendLine(`Unable to resolve remote: ${e}`);
		}
	}

	async ensure(): Promise<GitHubRepository> {
		this._initialized = true;

		if (!await this._credentialStore.hasBitbukit(this.remote)) {
			this._bitbukit = await this._credentialStore.loginWithConfirmation(this.remote);
		} else {
			this._bitbukit = await this._credentialStore.getBitbukit(this.remote);
		}

		return this;
	}

	async authenticate(): Promise<boolean> {
		this._initialized = true;
		if (!await this._credentialStore.hasBitbukit(this.remote)) {
			this._bitbukit = await this._credentialStore.login(this.remote);
		} else {
			this._bitbukit = this._credentialStore.getBitbukit(this.remote);
		}
		return this.bitbukit !== undefined;
	}

	async getDefaultBranch(): Promise<string> {
		try {
			const { bitbukit, remote } = await this.ensure();
			const { data } = await bitbukit.repositories.get({
				username: remote.owner,
				repo_slug: remote.repositoryName
			});

			return data.mainbranch.name;
		} catch (e) {
			Logger.appendLine(`GitHubRepository> Fetching default branch failed: ${e}`);
		}

		return 'master';
	}

	async getPullRequests(prType: PRType, page?: number): Promise<PullRequestData> {
		return prType === PRType.All ? this.getAllPullRequests(page) : this.getPullRequestsForCategory(prType, page);
	}

	private async getAllPullRequests(page?: number): Promise<PullRequestData> {
		try {
			const { bitbukit, remote } = await this.ensure();
			const { data } = await bitbukit.pullrequests.list({
				username: remote.owner,
				repo_slug: remote.repositoryName,
				page: page.toString() || '1'
			});
			const hasMorePages = !!data.next;

			let pulls: IPullRequest[] = data.values;
			let promises = [];
			pulls.forEach(item => {
				promises.push(new Promise(async (resolve, reject) => {
					let prData = await bitbukit.pullrequests.listCommits({
						username: remote.owner,
						repo_slug: remote.repositoryName,
						pull_request_id: item.id.toString()
					});
					resolve(prData);

					const parentCommit: BitBucket.Schema.BaseCommit = prData.data.values[prData.data.values.length-1].parents[0];
					let baseCommit: BitBucket.Schema.PullrequestEndpoint = {
						branch: {
							name: item.destination.branch.name
						},
						commit: {
							hash: parentCommit.hash
						},
						repository: item.destination.repository
					};
					item.base = baseCommit;
				}));
			});

			let pullRequests = await Promise.all(promises).then(() => {
				return pulls.map(item => {
					// if (!item.data.head.repo) {
					// 	Logger.appendLine('GitHubRepository> The remote branch for this PR was already deleted.');
					// 	return null;
					// }

					return new PullRequestModel(this, this.remote, item);
				}).filter(item => item !== null);
			});

			return {
				pullRequests,
				hasMorePages
			};
		} catch (e) {
			Logger.appendLine(`GitHubRepository> Fetching all pull requests failed: ${e}`);
			if (e.code === 404) {
				// not found
				vscode.window.showWarningMessage(`Fetching pull requests for remote '${this.remote.remoteName}' failed, please check if the url ${this.remote.url} is valid.`);
			} else {
				throw e;
			}
		}

		return null;
	}

	private async getPullRequestsForCategory(prType: PRType, page: number): Promise<PullRequestData> {
		// try {
		// 	const { bitbukit, remote } = await this.ensure();
		// 	const user = await bitbukit.users.get({});
		// 	// Search api will not try to resolve repo that redirects, so get full name first
		// 	const repo = await bitbukit.repos.get({ owner: this.remote.owner, repo: this.remote.repositoryName });
		// 	const { data, headers } = await bitbukit.search.issues({
		// 		q: this.getPRFetchQuery(repo.data.full_name, user.data.login, prType),
		// 		per_page: PULL_REQUEST_PAGE_SIZE,
		// 		page: page || 1
		// 	});
		// 	let promises = [];
		// 	data.items.forEach(item => {
		// 		promises.push(new Promise(async (resolve, reject) => {
		// 			let prData = await bitbukit.pullRequests.get({
		// 				owner: remote.owner,
		// 				repo: remote.repositoryName,
		// 				number: item.number
		// 			});
		// 			resolve(prData);
		// 		}));
		// 	});

		// 	const hasMorePages = !!headers.link && headers.link.indexOf('rel="next"') > -1;
		// 	const pullRequests = await Promise.all(promises).then(values => {
		// 		return values.map(item => {
		// 			if (!item.data.head.repo) {
		// 				Logger.appendLine('GitHubRepository> The remote branch for this PR was already deleted.');
		// 				return null;
		// 			}
		// 			return new PullRequestModel(this, this.remote, item.data);
		// 		}).filter(item => item !== null);
		// 	});

		// 	return {
		// 		pullRequests,
		// 		hasMorePages
		// 	};
		// } catch (e) {
		// 	Logger.appendLine(`GitHubRepository> Fetching all pull requests failed: ${e}`);
		// 	if (e.code === 404) {
		// 		// not found
		// 		vscode.window.showWarningMessage(`Fetching pull requests for remote ${this.remote.remoteName}, please check if the url ${this.remote.url} is valid.`);
		// 	} else {
		// 		throw e;
		// 	}
		// }
		return null;
	}

	async getPullRequest(id: number): Promise<PullRequestModel> {
		try {
			const { bitbukit, remote } = await this.ensure();
			let { data } = await bitbukit.pullrequests.get({
				username: remote.owner,
				repo_slug: remote.repositoryName,
				pull_request_id: id
			});

			let commitsResult = await bitbukit.pullrequests.listCommits({
				username: remote.owner,
				repo_slug: remote.repositoryName,
				pull_request_id: id.toString()
			});

			const parentCommit: BitBucket.Schema.BaseCommit = commitsResult.data.values[commitsResult.data.values.length-1].parents[0];
			let baseCommit: BitBucket.Schema.PullrequestEndpoint = {
				branch: {
					name: data.destination.branch.name
				},
				commit: {
					hash: parentCommit.hash
				},
				repository: data.destination.repository
			};
			let pr: IPullRequest = data;
			pr.base = baseCommit;

			// TODO implement this check
			// if (!data.head.repo) {
			// 	Logger.appendLine('GitHubRepository> The remote branch for this PR was already deleted.');
			// 	return null;
			// }

			return new PullRequestModel(this, remote, data);
		} catch (e) {
			Logger.appendLine(`GithubRepository> Unable to fetch PR: ${e}`);
			return null;
		}
	}

	// private getPRFetchQuery(repo: string, user: string, type: PRType) {
	// 	let filter = '';
	// 	switch (type) {
	// 		case PRType.RequestReview:
	// 			filter = `review-requested:${user}`;
	// 			break;
	// 		case PRType.AssignedToMe:
	// 			filter = `assignee:${user}`;
	// 			break;
	// 		case PRType.Mine:
	// 			filter = `author:${user}`;
	// 			break;
	// 		default:
	// 			break;
	// 	}

	// 	return `is:open ${filter} type:pr repo:${repo}`;
	// }
}