/**
 * The application entry point
 */

global.Promise = require('bluebird')
const _ = require('lodash')
const config = require('config')
const logger = require('./common/logger')
const Kafka = require('no-kafka')
const co = require('co')
const ProcessorService = require('./services/ProcessorService')

// create consumer
const options = { connectionString: config.KAFKA_URL }
if (config.KAFKA_CLIENT_CERT && config.KAFKA_CLIENT_CERT_KEY) {
  options.ssl = { cert: config.KAFKA_CLIENT_CERT, key: config.KAFKA_CLIENT_CERT_KEY }
}
const consumer = new Kafka.SimpleConsumer(options)

// data handler
const dataHandler = (messageSet, topic, partition) => Promise.each(messageSet, (m) => {
  const message = m.message.value.toString('utf8')
  logger.info(`Handle Kafka event message; Topic: ${topic}; Partition: ${partition}; Offset: ${
    m.offset}; Message: ${message}.`)
  let messageJSON
  try {
    messageJSON = JSON.parse(message)
  } catch (e) {
    logger.error('Invalid message JSON.')
    logger.error(e)
    // ignore the message
    return
  }
  if (!messageJSON.categoryName || messageJSON.categoryName.toLowerCase() !== 'communities') {
    logger.info('The message categoryName field is not \'communities\', it is ignored.')
    // ignore the message
    return
  }
  return co(function * () {
    yield ProcessorService.processMessage(messageJSON)
  })
    // commit offset
    .then(() => consumer.commitOffset({ topic, partition, offset: m.offset }))
    .catch((err) => logger.error(err))
})

consumer
  .init()
  // consume configured topics
  .then(() => {
    const topics = config.KAFKA_TOPICS
    _.each(topics, (tp) => consumer.subscribe(tp, { time: Kafka.LATEST_OFFSET }, dataHandler))
  })
  .catch((err) => logger.error(err))
