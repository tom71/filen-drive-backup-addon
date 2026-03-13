import json
import aiohttp_jinja2
import jinja2
from os.path import abspath, join
from aiohttp.web import Application, json_response, Request, TCPSite, AppRunner, post, Response, static, get
from backup.config import Config, Setting, VERSION
from injector import inject, singleton
from .errorstore import ErrorStore
from .cloudlogger import CloudLogger
from backup.time import Time


@singleton
class Server():
    @inject
    def __init__(self,
                 config: Config,
                 logger: CloudLogger,
                 error_store: ErrorStore,
                 time: Time):
        self._time = time
        self.logger = logger
        self.config = config
        self.error_store = error_store

    def base_context(self, request: Request):
        return {
            'version': VERSION,
            'backgroundColor': request.query.get('bg', self.config.get(Setting.BACKGROUND_COLOR)),
            'accentColor': request.query.get('ac', self.config.get(Setting.ACCENT_COLOR)),
            'bmc_logo_path': "/static/" + VERSION + "/images/bmc.svg"
        }

    async def authorize(self, request: Request):
        return await self.filen_authenticate(request)

    async def error(self, request: Request):
        try:
            self.logReport(request, await request.json())
        except BaseException as e:
            self.logError(request, e)
        return Response()

    async def refresh(self, request: Request):
        return await self.filen_refresh(request)

    async def picker(self, request: Request):
        return await self.filen_picker(request)

    @aiohttp_jinja2.template('server-index.jinja2')
    async def index(self, request: Request):
        return self.base_context(request)

    async def health(self, request: Request):
        return json_response({
            'status': 'ok',
            'messages': []
        })

    async def filen_authenticate(self, _request: Request):
        # Filen authentication is API-key based and handled directly in the addon UI.
        return json_response({
            "message": "Filen authentication does not use OAuth. Please set your Filen API key in the addon settings."
        }, status=400)

    async def filen_picker(self, _request: Request):
        # There is no folder picker flow required for Filen.
        return json_response({
            "message": "Filen does not support the Filen folder picker flow."
        }, status=400)

    async def filen_refresh(self, _request: Request):
        # Filen API keys are long-lived and do not require refresh tokens.
        return json_response({
            "message": "Filen API keys do not require refresh."
        }, status=400)

    def buildApp(self, app):
        path = abspath(join(__file__, "..", "..", "static"))
        app.add_routes([
            static("/static/" + VERSION, path, append_version=True),
            static("/drive/static/" + VERSION, path, append_version=True),
            static("/filen/static/" + VERSION, path, append_version=True),
            get("/filen/picker", self.filen_picker),
            get("/filen/authenticate", self.filen_authenticate),
            post("/filen/refresh", self.filen_refresh),
            get("/drive/picker", self.picker),
            get("/", self.index),
            get("/drive/authorize", self.authorize),
            post("/drive/refresh", self.refresh),
            post("/logerror", self.error),
            get("/health", self.health)
        ])
        aiohttp_jinja2.setup(app, loader=jinja2.FileSystemLoader(path))
        return app

    async def start(self):
        runner = AppRunner(self.buildApp(Application()))
        await runner.setup()
        site = TCPSite(runner, "0.0.0.0", int(self.config.get(Setting.PORT)))
        await site.start()
        self.logger.info("Backup Auth Server Started")

    def logError(self, request: Request, exception: Exception):
        data = self.getRequestInfo(request)
        data['exception'] = self.logger.formatException(exception)
        self.logger.log_struct(data)

    def logReport(self, request, report):
        data = self.getRequestInfo(request, include_timestamp=True)
        data['report'] = report
        self.error_store.store(data)

    def getRequestInfo(self, request: Request, include_timestamp=False):
        data = {
            'client': request.headers.get('client', "unknown"),
            'version': request.headers.get('addon_version', "unknown"),
            'address': request.remote,
            'url': str(request.url),
            'length': request.content_length,
        }
        if include_timestamp:
            data['server_time'] = self._time.now()
        return data
