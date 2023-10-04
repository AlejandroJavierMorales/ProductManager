
//IIFE Inmediate Funtion Expression// para poder trabajar con el await ya que mongoDB devuelve una promesa y
//poder poner el async
//se hace una funcion IIFE y se coloca todo el codigo del servidor dentro de la misma.
//las importacones antes del await y todas las declaraciones luego del await 
//Primero conectar la Base de Datos y Luego levantar e Servidor

const initializePassport = require('./config/passport.config');

//**** (async funtion main(){})() **** o arrow function)
(async () => {

    const { Command } = require('commander');
    const program = new Command();
    program.option('-e, --env <env>', 'Entorno de Ejecucion', 'development');
    program.parse();

    //destructuro la variable env de program.option() que contiene Entorno de Desarrollo en el que trabajare
    const { env } = program.opts();
    console.log('Env: ' + env)
    const path = require('path');
    const http = require('http');

    //importo la libreria dotenv de variables de entorno
    const dotenv = require('dotenv');
    dotenv.config({
        path: path.join(__dirname, env === 'development' ? '.env.development' : '.env')
    })

    const express = require('express');
    const handlebars = require('express-handlebars');
    const { Server } = require('socket.io');
    const mongoose = require('mongoose');
    const chatMessageManager = require('../src/dao/managers/chats/Chat.db.message.manager');
    //Login cookies and sessions********
    const cookieParser = require('cookie-parser');
    const session = require('express-session')
    // const fileStore = require('session-file-store')
    const MongoStore = require('connect-mongo');
    //passport
    const passport = require('passport');
    const InitializePassport = require('./config/passport.config');
    // importo config de variables de entorno
    const config = require('../src/config/config');
    //Importo los Tipos de Errores
    const { ErrorType } = require('../src/errors/custom.error')
    //Importo los routers
    const { api, views, mockingProducts } = require('../src/routes/index');
    let userOnline = [];


    try {
        await mongoose.connect(config.MONGO_URL);
        //connection strings CartCoder data base:   mongodb+srv://javier:<password>@cluster0.ewuqtys.mongodb.net/?retryWrites=true&w=majority
        console.log('Conectado a la Base de Datos de MongoDB')

        const app = express();
        app.use(express.urlencoded({ extended: true })); //middleware que parsea body y query params
        app.use(express.json()); //middleware que parsea el body (JSON)

        /* app.use(express.static(path.join(__dirname,'public'))); */
        app.use('/client', express.static(path.join(__dirname, '../client/public')));
        app.use('/uploads', express.static(path.join(__dirname, '../src/uploads')));//Ruta que indica donde se guardan las imagenes de los productos en en lado del servidor

        //cookies*****
        app.use(cookieParser('esunsecreto'))

        app.use(session({
            secret: 'esunsecreto',
            resave: true,
            saveUninitialized: true,
            // store: ''
            // store: new FileStore({ path: './sessions', ttl: 100, retries: 0 }),
            store: MongoStore.create({
                mongoUrl: config.MONGO_URL,
                ttl: 60 * 60
            })
        }));

        // registro de los middlewares de passport
        InitializePassport();

        app.use(passport.initialize());
        app.use(passport.session());

        /// middleware global
        app.use((req, res, next) => {

            console.log('respuesa User:' + JSON.stringify(req.user, null, 2))
            /* console.log('respuesa de session:'+ JSON.stringify(req.session,null,2), req.user) */
            // console.log(req.cookies) // leer las cookies
            // console.log(req.signedCookies)

            /* console.log(req.session); */

            // const { user } = req.cookies
            /* console.log(req.session, req.user);*/
            next();
        });

        //routers
        app.use('/api', api);
        app.use('/', views);
        app.use('/', mockingProducts);



        //Uploading Server
        const port = config.PORT;
        const httpServer = app.listen(port, () => {
            console.log(`Express Server Listening on Port ${port}...`);
        });


        //configuraciones de Template Engine
        app.engine('handlebars', handlebars.engine());
        app.set('views', path.join(__dirname + '/views'));
        app.set('view engine', 'handlebars');

        //SocketServer
        const socketServer = new Server(httpServer); //servidor para trabajar con socket (io)
        // Asignar la instancia de Socket.IO a una propiedad personalizada en el objeto 'app'
        app.set('socketio', socketServer);//esta me permite llamarla desde las rutas POST y PUT para que
        //al  modificar algun producto pueda avisar al Servidor y este a todos los clientes conectados (y actualizar todas las vistas en "tiempo real")

        const chat = [];

        socketServer.on('connection', async socket => { //listening "connection" event from a client
            console.log(`Nuevo Cliente Conectado - Socket -> ${socket.id}`);

            socket.on('msg_realtime', data => { //listening "msg_realtime" event from a client
                /*  console.log('Detalle de Productos en Tiempo Real: ' + data) */
            })

            //chat
            /// logica de mensajes
            // obtener todos los mensajes de la base de datos
            let messages = ''
            messages = await chatMessageManager.getAll()
            socket.emit('chat-messages', messages)

            socket.on('chat-message', async (msg) => {
                // guardar el mensaje en la DB
                const resp = await chatMessageManager.create(msg);
                socket.broadcast.emit('chat-message', msg);
            })
            socket.on('user', ({ user, action }) => {
                userOnline[socket.id] = user;
                socket.broadcast.emit('user', { user, action });
                //interactuar con el modelo de usuario
            })
            socket.on('disconnect', () => {
                socket.broadcast.emit('user', {
                    user: userOnline[socket.id],
                    action: false
                    // interactuar con el modelo de usuario
                })
                delete userOnline[socket.id] // como borrar la propiedad del objeto
            })
        })

        //Middleware de Errores
        app.use((err, req, res, next) => {
            /* console.log('ErrorCode: ' + err.code) */
            const newError = ErrorType.find(e => e.code === err.code)
            switch (err.code) {
                case 'NoProductsInDB':
                    res.status(404).send({
                        stauts: 'Error',
                        message: newError.type
                    });
                    break;
                case 'ProductIdNotFound':
                    res.status(404).send({
                        stauts: 'Error',
                        message: newError.type
                    });
                    break;
                case 'CastErrorProduct':
                    res.status(404).send({
                        stauts: 'Error',
                        message: newError.type
                    });
                    break;
                case 'MissingProductProperty':
                    res.status(404).send({
                        stauts: 'Error',
                        message: newError.type
                    });
                    break;
                case 'ProductAlreadyExist':
                    res.status(404).send({
                        stauts: 'Error',
                        message: newError.type
                    });
                    break;
                case 'CartIdNotFound':
                    res.status(404).send({
                        stauts: 'Error',
                        message: newError.type
                    });
                    break;
                case 'CastErrorCart':
                    res.status(404).send({
                        stauts: 'Error',
                        message: newError.type
                    });
                    break;
                case 'CartAlreadyExist':
                    res.status(404).send({
                        stauts: 'Error',
                        message: newError.type
                    });
                    break;
                case 'TicketNoGenerated':
                    res.status(404).send({
                        stauts: 'Error',
                        message: newError.type
                    });
                    break;
                case 'ServerError':
                    res.status(500).send({
                        stauts: 'Error',
                        message: newError.type + ' *** ' + err.stack
                    });
                    break;
            }
        })
    } catch (error) {
        console.log('ERROR: ' + error)
    }
})()








