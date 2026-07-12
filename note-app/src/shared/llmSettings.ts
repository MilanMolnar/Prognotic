import { LlmSettings } from './models'
import { isImageRecognitionAvailable } from './vision'

export const isLlmSelectionVerified = (
    settings: Pick<LlmSettings, 'provider' | 'model' | 'verifiedConnection'>
): boolean => settings.model.length > 0 &&
    settings.verifiedConnection?.provider === settings.provider &&
    settings.verifiedConnection.model === settings.model

export const isImageRecognitionSelectionVerified = (
    settings: Pick<LlmSettings, 'provider' | 'imageRecognitionModel' | 'verifiedImageRecognitionConnection'>
): boolean => settings.imageRecognitionModel.length > 0 &&
    settings.verifiedImageRecognitionConnection?.provider === settings.provider &&
    settings.verifiedImageRecognitionConnection.model === settings.imageRecognitionModel

export const isImageRecognitionReady = (
    settings: Pick<LlmSettings, 'provider' | 'imageRecognitionModel' | 'verifiedImageRecognitionConnection'>
): boolean => isImageRecognitionSelectionVerified(settings) &&
    (isImageRecognitionAvailable(settings.provider) || settings.provider === 'local')
