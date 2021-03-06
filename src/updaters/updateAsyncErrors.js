/* @flow */
/* eslint-disable no-nested-ternary */
import Task from 'data.task'
import {
  assoc,
  assocPath,
  concat,
  contains,
  keys,
  map,
  mapObjIndexed,
  or,
  path,
  prop,
  pathOr,
  reduce,
  sequence,
  values,
  zipObj,
} from 'ramda'

import isValid from '../utils/isValid'
import type { EnhancedProps, StateEffects } from './types'
import { VALIDATE_FIELD, VALIDATE_FIELD_ASYNC, VALIDATE_ALL } from '../constants'

/**
 * Converts a list of promises into a list of Tasks that when run will either return null or the error message
 *
 * @param rules
 * @param value
 * @param form
 * @returns {Function}
 */
const createLazyPromises = (rules: Array<Function>, value: any, form: Object): Array<Function> =>
  map(([promise, errorMsg]) => new Task((rej, res) => {
    promise(value, form).then(valid =>
      res(valid
        ? null
        : typeof errorMsg === 'function'
          ? errorMsg(value)
          : errorMsg // eslint-disable-line comma-dangle
      ), rej)
  }), rules)

/**
 * @param {Array} promises expecting an array of error messages
 * @returns {Array} flattened error messages
 */
const flatErrorMsgs = reduce((xs, x) => x ? concat(xs, [x]) : xs, [])

/**
 *
 * @param {[Object, Array]} state a tuple containing
 * @param {Array} effects
 * @param {Array} type
 * @param {Object} enhancedProps
 * @returns {[Object, Array]}
 */
export default function updateAsyncErrors(
  [state, effects]: StateEffects,
  type: Array<string>,
  {
    name = [],
    value,
    asyncRules,
  }: EnhancedProps // eslint-disable-line comma-dangle, indent
) {
  if (!asyncRules) return [state, effects]

  if (or(contains(VALIDATE_FIELD, type), (contains(VALIDATE_FIELD_ASYNC, type)))
    && prop(name, asyncRules)
    && (isValid(pathOr([], ['errors', ...name], state)))) {
    const updatedState = assoc('pending', true, state)
    const promises = createLazyPromises(path([...name], asyncRules), value, prop('form', state))

    const runPromises = () => sequence(Task.of, values(promises))
      .map(result => {
        const asyncErrors = flatErrorMsgs(result)
        return (prevState) => ({
          ...prevState,
          pending: false,
          asyncErrors: assocPath([...name], asyncErrors, prop('asyncErrors', prevState)),
        })
      })

    return [updatedState, concat(effects, [runPromises])]
  }

  if (contains(VALIDATE_ALL, type)) {
    const updatedState = assoc('pending', true, state)
    const promises: Object = mapObjIndexed((rules, key) =>
      createLazyPromises(rules, path(['form', key], state)), asyncRules)

    const runPromises = () => sequence(Task.of, map(sequence(Task.of), values(promises)))
      .map(result => {
        const asyncErrors = map(flatErrorMsgs, zipObj(keys(promises), result))
        return (prevState) => ({
          ...prevState,
          pending: false,
          asyncErrors,
        })
      })

    return [updatedState, concat(effects, [runPromises])]
  }

  return [state, effects]
}
