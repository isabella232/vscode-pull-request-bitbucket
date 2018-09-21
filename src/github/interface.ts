import * as vscode from 'vscode';
import { GitHubRef } from '../common/githubRef';
import { Comment } from '../common/comment';
import { TimelineEvent } from '../common/timelineEvent';
import { Remote } from '../common/remote';

export enum PRType {
	RequestReview = 0,
	AssignedToMe = 1,
	Mine = 2,
	Mention = 3,
	All = 4,
	LocalPullRequest = 5
}

export enum ReviewEvent {
	Approve = 'APPROVE',
	RequestChanges = 'REQUEST_CHANGES',
	Comment = 'COMMENT'
}

export enum PullRequestStateEnum {
	Open,
	Merged,
	Closed,
}

export interface IAccount {
	login: string;
	isUser: boolean;
	isEnterprise: boolean;
	avatarUrl: string;
	htmlUrl: string;
	ownedPrivateRepositoryCount?: number;
	privateRepositoryInPlanCount?: number;
}

export interface IRepository {
	label: string;
	ref: string;
	repo: any;
	sha: string;
}

// Copied from BitBucket.Schema.PullRequest
export interface IPullRequest {
	author?: BitBucket.Schema.Account;
	close_source_branch?: boolean;
	closed_by?: BitBucket.Schema.Account;
	comment_count?: number;
	created_on?: string;
	destination?: BitBucket.Schema.PullrequestEndpoint;
	id?: number;
	links?: {
		activity?: {
			href?: string;
			name?: string;
		};
		approve?: {
			href?: string;
			name?: string;
		};
		comments?: {
			href?: string;
			name?: string;
		};
		commits?: {
			href?: string;
			name?: string;
		};
		decline?: {
			href?: string;
			name?: string;
		};
		diff?: {
			href?: string;
			name?: string;
		};
		html?: {
			href?: string;
			name?: string;
		};
		merge?: {
			href?: string;
			name?: string;
		};
		self?: {
			href?: string;
			name?: string;
		};
	};
	merge_commit?: {
		hash?: string;
	};
	participants?: BitBucket.Schema.Participant[];
	reason?: string;
	reviewers?: BitBucket.Schema.Account[];
	source?: BitBucket.Schema.PullrequestEndpoint;
	base?: BitBucket.Schema.PullrequestEndpoint;
	state?: 'MERGED' | 'SUPERSEDED' | 'OPEN' | 'DECLINED';
	summary?: {
		html?: string;
		markup?: 'markdown' | 'creole' | 'plaintext';
		raw?: string;
	};
	task_count?: number;
	title?: string;
	updated_on?: string;
	[k: string]: any;
}

export interface FileChange {
	additions: number;
	blob_url: string;
	changes: number;
	contents_url: string;
	deletions: number;
	filename: string;
	patch?: string;
	raw_url: string;
	sha: string;
	status: string;
}

export interface Commit {
	author: {
		avatar_url: string;
		html_url: string;
		login: string;
	};
	commit: {
		author: {
			name: string;
			date: string;
			email: string;
		};
		message: string;
	};
	html_url: string;
	sha: string;
	parents: any;
}

export interface IPullRequestModel {
	prNumber: number;
	title: string;
	html_url: string;
	state: PullRequestStateEnum;
	commentCount: number;
	commitCount: number;
	author: IAccount;
	assignee: IAccount;
	createdAt: string;
	updatedAt: string;
	isOpen: boolean;
	isMerged: boolean;
	head?: GitHubRef;
	base?: GitHubRef;
	mergeBase?: string;
	localBranchName?: string;
	userAvatar: string;
	userAvatarUri: vscode.Uri;
	body: string;
	update(prItem: IPullRequest): void;
	equals(other: IPullRequestModel): boolean;
}

export interface IPullRequestsPagingOptions {
	fetchNextPage: boolean;
}

export interface IGitHubRepository {
	authenticate(): Promise<boolean>;
}

export interface IPullRequestManager {
	activePullRequest?: IPullRequestModel;
	readonly onDidChangeActivePullRequest: vscode.Event<void>;
	getLocalPullRequests(): Promise<IPullRequestModel[]>;
	deleteLocalPullRequest(pullRequest: IPullRequestModel): Promise<void>;
	getPullRequests(type: PRType, options?: IPullRequestsPagingOptions): Promise<[IPullRequestModel[], boolean]>;
	mayHaveMorePages(): boolean;
	getPullRequestComments(pullRequest: IPullRequestModel): Promise<Comment[]>;
	getPullRequestCommits(pullRequest: IPullRequestModel): Promise<Commit[]>;
	getCommitChangedFiles(pullRequest: IPullRequestModel, commit: Commit): Promise<FileChange[]>;
	getReviewComments(pullRequest: IPullRequestModel, reviewId: string): Promise<Comment[]>;
	getTimelineEvents(pullRequest: IPullRequestModel): Promise<TimelineEvent[]>;
	getIssueComments(pullRequest: IPullRequestModel): Promise<Comment[]>;
	createIssueComment(pullRequest: IPullRequestModel, text: string): Promise<Comment>;
	createCommentReply(pullRequest: IPullRequestModel, body: string, reply_to: string): Promise<Comment>;
	createComment(pullRequest: IPullRequestModel, body: string, path: string, position: number): Promise<Comment>;
	closePullRequest(pullRequest: IPullRequestModel): Promise<any>;
	approvePullRequest(pullRequest: IPullRequestModel, message?: string): Promise<any>;
	requestChanges(pullRequest: IPullRequestModel, message?: string): Promise<any>;
	getPullRequestChangedFiles(pullRequest: IPullRequestModel): Promise<FileChange[]>;
	getPullRequestRepositoryDefaultBranch(pullRequest: IPullRequestModel): Promise<string>;

	/**
	 * Fullfill information for a pull request which we can't fetch with one single api call.
	 * 1. base. This property might not exist in search results
	 * 2. head. This property might not exist in search results
	 * 3. merge base. This is necessary as base might not be the commit that files in Pull Request are being compared to.
	 * @param pullRequest
	 */
	fullfillPullRequestMissingInfo(pullRequest: IPullRequestModel): Promise<void>;
	updateRepositories(): Promise<void>;
	authenticate(): Promise<boolean>;

	/**
	 * git related APIs
	 */

	resolvePullRequest(owner: string, repositoryName: string, pullReuqestNumber: number): Promise<IPullRequestModel>;
	getMatchingPullRequestMetadataForBranch();
	getBranchForPullRequestFromExistingRemotes(pullRequest: IPullRequestModel);
	checkout(branchName: string): Promise<void>;
	fetchAndCheckout(remote: Remote, branchName: string, pullRequest: IPullRequestModel): Promise<void>;
	createAndCheckout(pullRequest: IPullRequestModel): Promise<void>;

}

export interface ITelemetry {
	on(action: 'startup'): Promise<void>;
	on(action: 'authSuccess'): Promise<void>;
	on(action: 'commentsFromEditor'): Promise<void>;
	on(action: 'commentsFromDescription'): Promise<void>;
	on(action: 'prListExpandLocalPullRequest'): Promise<void>;
	on(action: 'prListExpandRequestReview'): Promise<void>;
	on(action: 'prListExpandAssignedToMe'): Promise<void>;
	on(action: 'prListExpandMine'): Promise<void>;
	on(action: 'prListExpandAll'): Promise<void>;
	on(action: 'prCheckoutFromContext'): Promise<void>;
	on(action: 'prCheckoutFromDescription'): Promise<void>;
	on(action: string): Promise<void>;

	shutdown(): Promise<void>;
}