import { mergeConfig } from 'vite'
import projectConfig from '../vite.config.ts'

// Reuse the project's configuration while excluding real .env files.
export default mergeConfig(projectConfig,{ envDir:'.v1-test-output/env-empty' })
