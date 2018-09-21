/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { GitHubRef } from '../common/githubRef';
import { Remote } from '../common/remote';
import { GitHubRepository } from './githubRepository';
import { IAccount, IPullRequest, IPullRequestModel, PullRequestStateEnum } from './interface';

export class PullRequestModel implements IPullRequestModel {
	public prNumber: number;
	public title: string;
	public html_url: string;
	public state: PullRequestStateEnum = PullRequestStateEnum.Open;
	public commentCount: number;
	public commitCount: number;
	public author: IAccount;
	public assignee: IAccount;
	public createdAt: string;
	public updatedAt: string;
	public localBranchName?: string;

	public get isOpen(): boolean {
		return this.state === PullRequestStateEnum.Open;
	}
	public get isMerged(): boolean {
		return this.state === PullRequestStateEnum.Merged;
	}

	public get userAvatar(): string {
		if (this.prItem) {
			return this.prItem.author.links.avatar.href;
		}

		return null;
	}
	public get userAvatarUri(): vscode.Uri {
		if (this.prItem) {
			return vscode.Uri.parse(this.userAvatar);
		}

		return null;
	}

	public get body(): string {
		if (this.prItem) {
			return this.prItem.summary.raw;
		}
		return null;
	}

	public head: GitHubRef;
	public base: GitHubRef;

	constructor(public readonly githubRepository: GitHubRepository, public readonly remote: Remote, public prItem: IPullRequest) {
		this.update(prItem);
	}

	update(prItem: IPullRequest): void {
		this.prNumber = prItem.id;
		this.title = prItem.title;
		this.html_url = prItem.links.html.href;
		this.author = {
			login: prItem.author.username,
			isUser: true,
			isEnterprise: null,
			avatarUrl: prItem.author.links.avatar.href,
			htmlUrl: prItem.author.links.html.href
		};

		switch (prItem.state) {
			case 'OPEN':
				this.state = PullRequestStateEnum.Open;
				break;
			case 'MERGED':
				this.state = PullRequestStateEnum.Merged;
				break;
			case 'DECLINED':
				this.state = PullRequestStateEnum.Closed;
				break;
		}

		if (prItem.author) {
			this.assignee = {
				login: prItem.author.username,
				isUser: true,
				isEnterprise: null,
				avatarUrl: prItem.author.links.avatar.href,
				htmlUrl: prItem.author.links.html.href
			};
		}

		this.createdAt = prItem.created_on;
		this.updatedAt = prItem.updated_on ? prItem.updated_on : this.createdAt;
		this.commentCount = prItem.comment_count;
		this.commitCount = 1;

		this.head = new GitHubRef(prItem.source.branch.name, prItem.source.branch.name, prItem.source.commit.hash, prItem.source.repository.links.html.href);
		this.base = new GitHubRef(prItem.destination.branch.name, prItem.destination.branch.name, prItem.destination.commit.hash, prItem.destination.repository.links.html.href);
	}

	equals(other: IPullRequestModel): boolean {
		if (!other) {
			return false;
		}

		if (this.prNumber !== other.prNumber) {
			return false;
		}

		if (this.html_url !== other.html_url) {
			return false;
		}

		return true;
	}
}
