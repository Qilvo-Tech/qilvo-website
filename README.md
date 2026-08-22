# Hextra Starter Template

[![Deploy to Cloudflare](https://github.com/Leonardo-Rocha/qilvo-website/actions/workflows/cloudflare.yaml/badge.svg)](https://github.com/Leonardo-Rocha/qilvo-website/actions/workflows/cloudflare.yaml)
[![Netlify Status](https://api.netlify.com/api/v1/badges/6e83fd88-5ffe-4808-9689-c0f3b100bfe3/deploy-status)](https://app.netlify.com/sites/hextra-starter-template/deploys)
![Vercel Deployment Status](https://img.shields.io/github/deployments/imfing/hextra-starter-template/production?logo=vercel&logoColor=white&label=vercel&labelColor=black&link=https%3A%2F%2Fhextra-starter-template.vercel.app%2F)


🐣 Minimal template for getting started with [Hextra](https://github.com/imfing/hextra)

![hextra-template](https://github.com/imfing/hextra-starter-template/assets/5097752/c403b9a9-a76c-47a6-8466-513d772ef0b7)

[🌐 Demo ↗](https://imfing.github.io/hextra-starter-template/)

## Quick Start

Use this template to create your own repository:

<img src="https://docs.github.com/assets/cb-77734/mw-1440/images/help/repository/use-this-template-button.webp" width=400 />

You can also quickly start developing using the following online development environment:

- [GitHub Codespaces](https://github.com/codespaces) 
    
    [![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/imfing/hextra-starter-template)

    Create a new codespace and follow the [Local Development](#local-development) to launch the preview

- [Gitpod](https://gitpod.io)

    [![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/imfing/hextra-starter-template)


## Deployment

### Cloudflare Workers

The Hugo site and private Steam wishlist dashboard deploy as one Cloudflare
Worker. Static site routes remain public; `/internal/*` is protected with HTTP
Basic authentication.

```shell
npm install
npm run check
npm run deploy
```

`STEAM_WEB_API_KEY` and `DASHBOARD_PASSWORD` are Worker secrets. Never add
them to this repository.

The GitHub Actions workflow verifies pull requests and deploys pushes to
`main`. It requires:

- Repository variable `CLOUDFLARE_ACCOUNT_ID`
- Repository secret `CLOUDFLARE_API_TOKEN`, scoped to edit Workers and D1

### Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/imfing/hextra-starter-template)

### Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fimfing%2Fhextra-starter-template&env=HUGO_VERSION)

Override the configuration:

<img src="https://github.com/imfing/hextra-starter-template/assets/5097752/e2e3cecd-c884-47ec-b064-14f896fee08d" width=600 />

## Local Development

Pre-requisites: [Hugo](https://gohugo.io/getting-started/installing/), [Go](https://golang.org/doc/install) and [Git](https://git-scm.com)

```shell
# Clone the repo
git clone https://github.com/imfing/hextra-starter-template.git

# Change directory
cd hextra-starter-template

# Start the server
hugo mod tidy
hugo server --logLevel debug --disableFastRender -p 1313
```

### Update theme

```shell
hugo mod get -u
hugo mod tidy
```

See [Update modules](https://gohugo.io/hugo-modules/use-modules/#update-modules) for more details.

